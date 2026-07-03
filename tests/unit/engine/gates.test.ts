import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { getAdjudication, upsertAdjudication } from "@/db/access/adjudications";
import { listAuditEvents } from "@/db/access/audit";
import { getCluster, upsertCluster } from "@/db/access/clusters";
import { getProperty, insertProperty } from "@/db/access/properties";
import { insertRiskSignal } from "@/db/access/signals";
import { adjudicateProperty, applyHumanAdjudication } from "@/mastra/engine/adjudication";
import { publishCluster, reviewCluster } from "@/mastra/engine/compose";

/**
 * Invariants for the human-in-the-loop gates, against a throwaway SQLite
 * db (tests/setup/engine-env.ts) with NO LLM configured — the exact
 * degraded-but-safe mode the engine must support:
 * - an unreviewed cluster can NEVER publish (hard-coded throw);
 * - publishing after a named review opens adjudications and escalates
 *   forced-red cases;
 * - resolving a red requires a human justification.
 */

const NOW = new Date().toISOString();
let seq = 0;

function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

function seedProperty(id: string): void {
  insertProperty({
    id,
    uprn: null,
    address: `${id} Gate Street`,
    postcode: "TS1 1AA",
    localAuthority: "Testshire",
    lat: 51.5,
    lng: -0.1,
    propertyType: "residential",
    tenure: "freehold",
    value: 150000,
    intendedUse: "Social housing acquisition",
    capitalType: "public",
    status: "verdict_pending_review",
    provenance: "synthetic",
  });
}

function seedRedSignal(propertyId: string): void {
  const result = insertRiskSignal({
    id: uid("sig"),
    propertyId,
    signalCode: "LAND-FLOOD",
    dimensionCode: "LAND",
    finding: "Property falls within an EA flood warning area with recent activations.",
    sourceRef: {
      dataset: "ea-flood-monitoring",
      recordId: `synthetic:${propertyId}:LAND-FLOOD`,
      url: "https://environment.data.gov.uk/flood-monitoring/doc/reference",
      retrievedAt: NOW,
    },
    severity: "red",
    confidence: 0.85,
    rationale: "Warning-area membership meets the red rubric threshold.",
  });
  if (!result.ok) throw new Error(result.issues.join("; "));
}

function seedCluster(id: string, propertyIds: string[], status: "draft" | "pending_review") {
  return upsertCluster({
    id,
    name: "Test cluster",
    description: "Gate-test cluster",
    propertyIds,
    pattern: "LAND-FLOOD:red",
    groupingRationale: "Shared flood signature (test).",
    proposedAssessment: "Assessment text",
    proposedDisclosure: "Disclosure text",
    status,
    reviewedBy: null,
    reviewedAt: null,
  });
}

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM adjudications; DELETE FROM risk_signals; DELETE FROM risk_clusters; DELETE FROM properties;");
});

describe("review gate — nothing publishes while reviewedAt is null", () => {
  it("refuses to publish a cluster that was never reviewed", async () => {
    const propertyId = uid("prop");
    seedProperty(propertyId);
    const cluster = seedCluster(uid("cluster"), [propertyId], "pending_review");

    await expect(publishCluster(cluster.id)).rejects.toThrow(/reviewedAt is null/);
    expect(getCluster(cluster.id)?.status).toBe("pending_review");
    expect(getAdjudication(`adj-${cluster.id}-${propertyId}`)).toBeUndefined();
  });

  it("request_changes sends the cluster back to draft with reviewedAt still null", () => {
    const propertyId = uid("prop");
    seedProperty(propertyId);
    const cluster = seedCluster(uid("cluster"), [propertyId], "pending_review");

    const rejected = reviewCluster(cluster.id, "request_changes", "Nadia", "Cite the flood record id.");
    expect(rejected.status).toBe("draft");
    expect(rejected.reviewedAt).toBeNull();
    const events = listAuditEvents({ entityType: "RiskCluster", entityId: cluster.id });
    expect(events.some((e) => e.action === "assessment_changes_requested" && e.actor === "user:nadia")).toBe(true);
  });

  it("publishes after a named approval and escalates the forced-red member", async () => {
    const propertyId = uid("prop");
    seedProperty(propertyId);
    seedRedSignal(propertyId); // single-source red → hard rule forces escalation
    const cluster = seedCluster(uid("cluster"), [propertyId], "pending_review");

    const approved = reviewCluster(cluster.id, "approve", "Nadia (Head of Due Diligence)");
    expect(approved.status).toBe("approved");
    expect(approved.reviewedBy).toContain("Nadia");
    expect(approved.reviewedAt).not.toBeNull();

    const published = await publishCluster(cluster.id);
    expect(published.status).toBe("published");

    const adjudication = getAdjudication(`adj-${cluster.id}-${propertyId}`);
    expect(adjudication?.status).toBe("escalated");
    expect(adjudication?.compositeVerdict).toBe("red");
    expect(adjudication?.escalationReason).toBe("high_severity_single_source");
    expect(getProperty(propertyId)?.status).toBe("escalated");
  });
});

describe("adjudication engine — forced red survives any model output", () => {
  it("adjudicateProperty escalates a single-source red with the hard-coded reason", async () => {
    const propertyId = uid("prop");
    seedProperty(propertyId);
    seedRedSignal(propertyId);
    const cluster = seedCluster(uid("cluster"), [propertyId], "pending_review");

    const adjudication = await adjudicateProperty({
      adjudicationId: uid("adj"),
      propertyId,
      clusterId: cluster.id,
      withLlm: false,
    });
    expect(adjudication.compositeVerdict).toBe("red");
    expect(adjudication.escalationReason).toBe("high_severity_single_source");
    expect(adjudication.status).toBe("escalated");
    expect(adjudication.verdictRationale).toMatch(/single/i);
  });
});

describe("human adjudication — red is never resolved without a human justification", () => {
  function seedEscalated(propertyId: string, clusterId: string): string {
    seedProperty(propertyId);
    seedCluster(clusterId, [propertyId], "pending_review");
    const id = uid("adj");
    upsertAdjudication({
      id,
      propertyId,
      clusterId,
      status: "escalated",
      compositeVerdict: "red",
      verdictRationale: "Forced red: single-source high-severity flood signal.",
      latestEvidence: null,
      escalationReason: "high_severity_single_source",
      assessedAt: NOW,
      lastActivityAt: NOW,
    });
    return id;
  }

  it("throws when marking a red resolved without comments", () => {
    const adjId = seedEscalated(uid("prop"), uid("cluster"));
    expect(() => applyHumanAdjudication(adjId, "mark_resolved", "  ")).toThrow(/justification/);
    expect(getAdjudication(adjId)?.status).toBe("escalated");
  });

  it("resolves a red with a justification, journaled under the human actor", () => {
    const adjId = seedEscalated(uid("prop"), uid("cluster"));
    const resolved = applyHumanAdjudication(
      adjId,
      "mark_resolved",
      "Site visit + paid flood search confirmed the defence scheme completed in 2024.",
    );
    expect(resolved.status).toBe("resolved");
    const events = listAuditEvents({ entityType: "Adjudication", entityId: adjId });
    expect(events[0]?.actor).toBe("user:nadia");
    expect(events[0]?.action).toBe("human_adjudication_mark_resolved");
  });

  it("confirm_risk keeps the red verdict and flags the property", () => {
    const propertyId = uid("prop");
    const adjId = seedEscalated(propertyId, uid("cluster"));
    const confirmed = applyHumanAdjudication(adjId, "confirm_risk", "Risk is real; do not proceed without indemnity.");
    expect(confirmed.status).toBe("adjudicated");
    expect(confirmed.compositeVerdict).toBe("red");
    expect(getProperty(propertyId)?.status).toBe("flagged");
  });
});
