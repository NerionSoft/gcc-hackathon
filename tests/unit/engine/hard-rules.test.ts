import { describe, expect, it } from "vitest";
import type { EvidenceUpdate, RiskSignal } from "@/db/schema";
import { applyHardRules } from "@/mastra/engine/adjudication";
import { checkFairness } from "@/mastra/engine/fairness";

/**
 * Invariants for the two HARD-CODED workflow rules (spec §4.1.C):
 * evidence integrity forces red regardless of any LLM output, and the
 * fairness guardrail excludes protected-characteristic proxies.
 * `applyHardRules` is the pure core that the adjudication engine applies
 * AFTER the verdict-adjudicator agent — so these tests cover exactly the
 * path that overrides the model.
 */

const NOW = new Date().toISOString();

function signal(overrides: Partial<RiskSignal>): RiskSignal {
  return {
    id: `sig-${Math.random().toString(36).slice(2)}`,
    propertyId: "prop-1",
    signalCode: "LAND-FLOOD",
    dimensionCode: "LAND",
    finding: "Property lies inside an EA flood alert area.",
    sourceRef: {
      dataset: "ea-flood-monitoring",
      recordId: "064WAF123",
      url: "https://environment.data.gov.uk/flood-monitoring/id/floodAreas/064WAF123",
      retrievedAt: NOW,
    },
    severity: "amber",
    confidence: 0.85,
    rationale: "Alert-area membership meets the amber rubric threshold.",
    ...overrides,
  };
}

describe("hard rule 1 — evidence integrity forces red", () => {
  it("forces red + high_severity_single_source for an uncorroborated red signal", () => {
    const outcome = applyHardRules([signal({ severity: "red" })]);
    expect(outcome.forcedVerdict).toBe("red");
    expect(outcome.escalationReason).toBe("high_severity_single_source");
  });

  it("does not force when a red signal is corroborated by a second dataset", () => {
    const outcome = applyHardRules([
      signal({ severity: "red" }),
      signal({
        severity: "red",
        sourceRef: {
          dataset: "ea-flood-planning",
          recordId: "fz3-000123",
          url: "https://environment.data.gov.uk/flood-planning/fz3-000123",
          retrievedAt: NOW,
        },
      }),
    ]);
    expect(outcome.forcedVerdict).toBeNull();
    expect(outcome.escalationReason).toBeNull();
  });

  it("forces red + insufficient_or_conflicting_evidence when two sources contradict", () => {
    const outcome = applyHardRules([
      signal({ severity: "green", finding: "No flood area covers this location." }),
      signal({
        severity: "red",
        sourceRef: {
          dataset: "ea-flood-planning",
          recordId: "fz3-000123",
          url: "https://environment.data.gov.uk/flood-planning/fz3-000123",
          retrievedAt: NOW,
        },
      }),
    ]);
    expect(outcome.forcedVerdict).toBe("red");
    expect(outcome.escalationReason).toBe("insufficient_or_conflicting_evidence");
  });

  it("forces red + material_new_adverse_evidence on a red monitoring update", () => {
    const incoming: EvidenceUpdate = {
      id: "ev-1",
      kind: "material_adverse",
      severity: "red",
      dimensionCode: "PEOPLE",
      signalCode: "PEOPLE-LITIGATION",
      headline: "Winding-up petition filed against the registered proprietor",
      detail: "Public insolvency filing recorded.",
      sourceRef: {
        dataset: "companies-house",
        recordId: "OC123456-insolvency",
        url: "https://find-and-update.company-information.service.gov.uk/company/OC123456",
        retrievedAt: NOW,
      },
    };
    const outcome = applyHardRules([signal({ severity: "green" })], incoming);
    expect(outcome.forcedVerdict).toBe("red");
    expect(outcome.escalationReason).toBe("material_new_adverse_evidence");
  });

  it("forces nothing on an ordinary green/amber evidence base", () => {
    const outcome = applyHardRules([signal({ severity: "amber" }), signal({ severity: "green", signalCode: "LAND-SOIL" })]);
    expect(outcome.forcedVerdict).toBeNull();
  });

  it("ignores low-confidence data-gap placeholders when applying rule 1", () => {
    // A red "signal" at confidence 0.2 is a data-gap note, not evidence.
    const outcome = applyHardRules([signal({ severity: "red", confidence: 0.2 })]);
    expect(outcome.forcedVerdict).toBeNull();
  });
});

describe("hard rule 2 — fairness guardrail (anti-redlining)", () => {
  const proxySignal = signal({
    signalCode: "BLOCK-INCIDENT",
    dimensionCode: "BLOCK",
    severity: "red",
    finding: "Neighbourhood risk driven by the demographic composition of residents.",
    rationale: "Area profile suggests elevated risk based on ethnic composition.",
  });

  it("detects protected-characteristic proxies in model-authored text", () => {
    expect(checkFairness(proxySignal).blocked).toBe(true);
    expect(checkFairness(signal({}))).toEqual({ blocked: false, matches: [] });
  });

  it("excludes proxy signals from the verdict and marks fairness_guardrail_triggered", () => {
    const clean = signal({ severity: "green" });
    const outcome = applyHardRules([proxySignal, clean]);
    expect(outcome.escalationReason).toBe("fairness_guardrail_triggered");
    expect(outcome.forcedVerdict).toBe("red"); // escalated for human review
    expect(outcome.fairnessExcluded.map((s) => s.id)).toEqual([proxySignal.id]);
    expect(outcome.included.map((s) => s.id)).toEqual([clean.id]);
  });

  it("never lets a proxy signal drive severity: the red proxy is not in `included`", () => {
    const outcome = applyHardRules([proxySignal, signal({ severity: "green" })]);
    expect(outcome.included.every((s) => checkFairness(s).blocked === false)).toBe(true);
  });
});
