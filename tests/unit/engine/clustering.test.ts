import { describe, expect, it } from "vitest";
import type { Property, RiskSignal } from "@/db/schema";
import {
  CLEAN_SIGNATURE,
  COMPOUND_SIGNATURE,
  computeClusters,
  severitySignature,
  type MemberInfo,
} from "@/mastra/engine/clustering";

/**
 * Invariant: clustering is DETERMINISTIC — a pure group-by on the
 * per-dimension severity signature (+ localAuthority + propertyType where
 * the data supports it). Same input → same clusters, in any input order.
 * The LLM writes rationale text only; membership never touches a model.
 */

const NOW = new Date().toISOString();

function property(
  id: string,
  localAuthority = "Testshire",
  propertyType = "residential",
): Property {
  return {
    id,
    uprn: null,
    address: `${id} Test Street`,
    postcode: "TS1 1AA",
    localAuthority,
    lat: 51.5,
    lng: -0.1,
    propertyType: propertyType as Property["propertyType"],
    tenure: "freehold",
    value: 100000,
    intendedUse: "Social housing acquisition",
    capitalType: "public",
    status: "signals_extracted",
    provenance: "synthetic",
  };
}

function signal(propertyId: string, dimensionCode: string, severity: string): RiskSignal {
  return {
    id: `${propertyId}-${dimensionCode}-${severity}-${Math.random().toString(36).slice(2, 6)}`,
    propertyId,
    signalCode: `${dimensionCode}-TEST`,
    dimensionCode: dimensionCode as RiskSignal["dimensionCode"],
    finding: "finding",
    sourceRef: {
      dataset: "test-dataset",
      recordId: "rec-1",
      url: "https://example.gov.uk/rec-1",
      retrievedAt: NOW,
    },
    severity: severity as RiskSignal["severity"],
    confidence: 0.9,
    rationale: "rationale",
  };
}

function member(id: string, signals: RiskSignal[], la?: string, type?: string): MemberInfo {
  return { property: property(id, la, type), signals, signature: severitySignature(signals) };
}

describe("severitySignature", () => {
  it("keeps the worst severity per dimension, amber or worse only", () => {
    const signals = [
      signal("p", "LAND", "green"),
      signal("p", "LAND", "red"),
      signal("p", "BUILDING", "amber"),
      signal("p", "MARKET", "green"),
    ];
    expect(severitySignature(signals)).toBe("BUILDING:amber+LAND:red");
  });

  it("returns CLEAN when every dimension is green", () => {
    expect(severitySignature([signal("p", "LAND", "green")])).toBe(CLEAN_SIGNATURE);
    expect(severitySignature([])).toBe(CLEAN_SIGNATURE);
  });
});

describe("clusterByRiskPattern determinism", () => {
  /** 100 clean + 50 LAND:red + 3 rare compound members. */
  function makeMembers(): MemberInfo[] {
    const members: MemberInfo[] = [];
    for (let i = 0; i < 100; i += 1) {
      members.push(
        member(`clean-${String(i).padStart(3, "0")}`, [signal(`clean-${i}`, "LAND", "green")]),
      );
    }
    for (let i = 0; i < 50; i += 1) {
      members.push(
        member(`flood-${String(i).padStart(3, "0")}`, [signal(`flood-${i}`, "LAND", "red")]),
      );
    }
    for (let i = 0; i < 3; i += 1) {
      members.push(
        member(`rare-${i}`, [
          signal(`rare-${i}`, "LAND", "red"),
          signal(`rare-${i}`, "PEOPLE", "red"),
          signal(`rare-${i}`, "BUILDING", "amber"),
        ]),
      );
    }
    return members;
  }

  function snapshot(members: MemberInfo[]) {
    return computeClusters(members, 40).map((c) => ({
      key: c.key,
      signature: c.signature,
      memberIds: c.members.map((m) => m.property.id),
    }));
  }

  it("same input → same clusters", () => {
    expect(snapshot(makeMembers())).toEqual(snapshot(makeMembers()));
  });

  it("input order does not change the clusters", () => {
    const shuffled = makeMembers().reverse();
    const mixed = [...shuffled.slice(37), ...shuffled.slice(0, 37)];
    expect(snapshot(mixed)).toEqual(snapshot(makeMembers()));
  });

  it("groups by signature and coalesces rare signatures into COMPOUND", () => {
    const clusters = snapshot(makeMembers());
    const keys = clusters.map((c) => c.signature).sort();
    expect(keys).toEqual([CLEAN_SIGNATURE, COMPOUND_SIGNATURE, "LAND:red"]);
    const compound = clusters.find((c) => c.signature === COMPOUND_SIGNATURE);
    expect(compound?.memberIds).toEqual(["rare-0", "rare-1", "rare-2"]);
  });

  it("splits a signature by (localAuthority, propertyType) only when every subgroup is viable", () => {
    const viable: MemberInfo[] = [];
    for (let i = 0; i < 50; i += 1) {
      viable.push(
        member(`a-${String(i).padStart(2, "0")}`, [signal(`a-${i}`, "LAND", "red")], "Northtown"),
      );
    }
    for (let i = 0; i < 50; i += 1) {
      viable.push(
        member(`b-${String(i).padStart(2, "0")}`, [signal(`b-${i}`, "LAND", "red")], "Southtown"),
      );
    }
    const split = computeClusters(viable, 40);
    expect(split.map((c) => c.key).sort()).toEqual([
      "LAND:red|Northtown|residential",
      "LAND:red|Southtown|residential",
    ]);

    // One member moved to a third authority → a dust subgroup would appear,
    // so the signature stays together as a single cluster.
    const unviable = [
      ...viable.slice(0, 99),
      member("c-00", [signal("c-0", "LAND", "red")], "Westtown"),
    ];
    const together = computeClusters(unviable, 40);
    expect(together.map((c) => c.key)).toEqual(["LAND:red"]);
  });
});
