import { describe, expect, it } from "vitest";
import { openDb } from "@/db/client";
import { appendAuditEvent, listAuditEvents } from "@/db/access/audit";
import { countSignals, insertRiskSignal, validateEmittableSignal } from "@/db/access/signals";
import { insertProperty } from "@/db/access/properties";
import { upsertCluster } from "@/db/access/clusters";
import { upsertAdjudication } from "@/db/access/adjudications";
import * as auditModule from "@/db/access/audit";

const NOW = new Date().toISOString();

function makeDb() {
  const db = openDb(":memory:");
  insertProperty(
    {
      id: "prop-1",
      uprn: null,
      address: "1 Test Street",
      postcode: "TS1 1AA",
      localAuthority: "Testshire",
      lat: 51.5,
      lng: -0.1,
      propertyType: "residential",
      tenure: "freehold",
      value: 250000,
      intendedUse: "social housing acquisition",
      capitalType: "public",
      status: "unscanned",
      provenance: "synthetic",
    },
    db,
  );
  return db;
}

const validSignal = {
  id: "sig-1",
  propertyId: "prop-1",
  signalCode: "LAND-FLOOD",
  dimensionCode: "LAND",
  finding: "Property lies within Environment Agency Flood Zone 3.",
  sourceRef: {
    dataset: "environment-agency-flood-map-for-planning",
    recordId: "fz3-000123",
    url: "https://environment.data.gov.uk/flood-planning/explore",
    retrievedAt: NOW,
  },
  severity: "red",
  confidence: 0.92,
  rationale:
    "Flood Zone 3 per the cited Environment Agency record — highest flood likelihood band.",
};

describe("evidence rule: no RiskSignal without complete sourceRef + confidence", () => {
  it("persists a fully sourced signal", () => {
    const db = makeDb();
    const result = insertRiskSignal(validSignal, db);
    expect(result.ok).toBe(true);
    expect(countSignals(db)).toBe(1);
  });

  it("rejects a signal missing its sourceRef and journals a failed extraction", () => {
    const db = makeDb();
    const { sourceRef: _dropped, ...unsourced } = validSignal;
    const result = insertRiskSignal(unsourced, db);
    expect(result.ok).toBe(false);
    expect(countSignals(db)).toBe(0);
    const events = listAuditEvents({ entityType: "RiskSignal" }, db);
    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe("signal_extraction_failed");
  });

  it.each([
    ["missing recordId", { ...validSignal.sourceRef, recordId: "" }],
    ["missing url", { ...validSignal.sourceRef, url: "" }],
    ["missing retrievedAt", { ...validSignal.sourceRef, retrievedAt: "" }],
  ])("rejects a signal with an incomplete sourceRef (%s)", (_label, sourceRef) => {
    const db = makeDb();
    const result = insertRiskSignal({ ...validSignal, sourceRef }, db);
    expect(result.ok).toBe(false);
    expect(countSignals(db)).toBe(0);
  });

  it("rejects a signal without confidence, even when fully sourced", () => {
    const db = makeDb();
    const { confidence: _dropped, ...noConfidence } = validSignal;
    expect(validateEmittableSignal(noConfidence).ok).toBe(false);
    const result = insertRiskSignal(noConfidence, db);
    expect(result.ok).toBe(false);
    expect(countSignals(db)).toBe(0);
  });
});

describe("audit ledger is append-only", () => {
  it("exposes no update or delete in the access module", () => {
    const exported = Object.keys(auditModule);
    expect(exported).toContain("appendAuditEvent");
    expect(exported.filter((name) => /update|delete|remove/i.test(name))).toHaveLength(0);
  });

  it("blocks raw SQL UPDATE and DELETE at the database level", () => {
    const db = makeDb();
    const event = appendAuditEvent(
      {
        actor: "agent",
        action: "test_action",
        entityType: "Property",
        entityId: "prop-1",
        rationale: "test",
      },
      db,
    );
    expect(() =>
      db.prepare("UPDATE audit_events SET action = 'tampered' WHERE id = ?").run(event.id),
    ).toThrow(/append-only/);
    expect(() => db.prepare("DELETE FROM audit_events WHERE id = ?").run(event.id)).toThrow(
      /append-only/,
    );
  });
});

describe("status-enum guard rails", () => {
  it("refuses to store a published cluster that was never reviewed", () => {
    const db = makeDb();
    expect(() =>
      upsertCluster(
        {
          id: "cluster-1",
          name: "Coastal flood cluster",
          description: "Test cluster",
          propertyIds: ["prop-1"],
          pattern: "LAND-FLOOD:red",
          groupingRationale: "Shared flood signature",
          proposedAssessment: null,
          proposedDisclosure: null,
          status: "published",
          reviewedBy: null,
          reviewedAt: null,
        },
        db,
      ),
    ).toThrow(/reviewedAt/);
  });

  it("refuses an adjudication verdict without a rationale", () => {
    const db = makeDb();
    upsertCluster(
      {
        id: "cluster-1",
        name: "Coastal flood cluster",
        description: "Test cluster",
        propertyIds: ["prop-1"],
        pattern: "LAND-FLOOD:red",
        groupingRationale: "Shared flood signature",
        proposedAssessment: null,
        proposedDisclosure: null,
        status: "draft",
        reviewedBy: null,
        reviewedAt: null,
      },
      db,
    );
    expect(() =>
      upsertAdjudication(
        {
          id: "adj-1",
          propertyId: "prop-1",
          clusterId: "cluster-1",
          status: "adjudicated",
          compositeVerdict: "red",
          verdictRationale: null,
          latestEvidence: null,
          escalationReason: "high_severity_single_source",
          assessedAt: NOW,
          lastActivityAt: NOW,
        },
        db,
      ),
    ).toThrow(/verdictRationale/);
  });
});
