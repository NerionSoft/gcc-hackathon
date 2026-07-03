import { describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { openDb } from "@/db/client";
import {
  appendAuditEvent,
  countAuditEvents,
  listAuditEvents,
  listAuditFacets,
} from "@/db/access/audit";
import { extractSourceRef } from "@/presentation/features/audit-log/contracts";

/**
 * The F6 provenance ledger read path: server-side pagination, filtering and
 * facets over the append-only audit table. These back the /audit view's
 * promise that any verdict traces to the exact record, at thousands-of-events
 * scale, without ever mutating history.
 */

function makeLedger(): Database.Database {
  const db = openDb(":memory:");
  for (let i = 0; i < 40; i += 1) {
    const isHuman = i % 4 === 0;
    appendAuditEvent(
      {
        actor: isHuman ? "user:nadia" : "agent",
        action: isHuman ? "human_adjudication_confirm_risk" : "signal_extracted",
        entityType: isHuman ? "Adjudication" : "RiskSignal",
        entityId: `entity-${String(i).padStart(3, "0")}`,
        rationale: `Event ${i}`,
        // Deterministic, ordered timestamps so pagination order is stable.
        payloadSnapshot: null,
      },
      db,
    );
  }
  return db;
}

describe("audit ledger pagination + filtering", () => {
  it("counts all events and pages without overlap", () => {
    const db = makeLedger();
    expect(countAuditEvents({}, db)).toBe(40);

    const page1 = listAuditEvents({ limit: 25, offset: 0 }, db);
    const page2 = listAuditEvents({ limit: 25, offset: 25 }, db);
    expect(page1).toHaveLength(25);
    expect(page2).toHaveLength(15);

    const ids = new Set([...page1, ...page2].map((e) => e.id));
    expect(ids.size).toBe(40); // no duplicates across pages
  });

  it("filters by actor and by action, and count matches the filtered list", () => {
    const db = makeLedger();
    const humanCount = countAuditEvents({ actor: "user:nadia" }, db);
    expect(humanCount).toBe(10);
    const humans = listAuditEvents({ actor: "user:nadia", limit: 100 }, db);
    expect(humans).toHaveLength(10);
    expect(humans.every((e) => e.actor === "user:nadia")).toBe(true);

    const byAction = listAuditEvents({ action: "signal_extracted", limit: 100 }, db);
    expect(byAction).toHaveLength(30);
    expect(byAction.every((e) => e.action === "signal_extracted")).toBe(true);
  });

  it("filters by timestamp window", () => {
    const db = makeLedger();
    const all = listAuditEvents({ limit: 100 }, db);
    const pivot = all[all.length - 1]!.timestamp; // oldest event
    const since = countAuditEvents({ after: pivot }, db);
    expect(since).toBe(40); // everything is >= the oldest
    const impossible = countAuditEvents({ before: "1970-01-01T00:00:00.000Z" }, db);
    expect(impossible).toBe(0);
  });

  it("recovers a source snapshot from an event payload (provenance link)", () => {
    const sourceRef = {
      dataset: "environment-agency-flood-map-for-planning",
      recordId: "fz3-000123",
      url: "https://environment.data.gov.uk/flood-planning/explore",
      retrievedAt: "2026-07-03T12:00:00.000Z",
    };
    // top-level sourceRef
    expect(extractSourceRef({ sourceRef })).toEqual(sourceRef);
    // one level down (payload wrapping the signal object)
    expect(extractSourceRef({ signal: { sourceRef } })).toEqual(sourceRef);
    // no source present
    expect(extractSourceRef({ note: "no source here" })).toBeNull();
    expect(extractSourceRef(null)).toBeNull();
  });

  it("exposes only real facet values for the filter bar", () => {
    const db = makeLedger();
    const facets = listAuditFacets(db);
    expect(facets.actors.sort()).toEqual(["agent", "user:nadia"]);
    expect(facets.actions.sort()).toEqual(["human_adjudication_confirm_risk", "signal_extracted"]);
    expect(facets.entityTypes.sort()).toEqual(["Adjudication", "RiskSignal"]);
  });
});
