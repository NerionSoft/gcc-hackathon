import { describe, it, expect } from "vitest";
import { composeReport, type ConseillerInput } from "@/mastra/agents/conseiller";
import type {
  SourceRef,
  ToolResult,
  RisksData,
  PricesData,
  AirData,
  CrimeData,
  EnergyData,
} from "@/types";
import { computeDomainWeights } from "@/types";

const SRC = (name: string): SourceRef => ({
  name,
  url: `https://example.test/${name}`,
  retrievedAt: "2026-07-03T00:00:00.000Z",
});
function ok<T>(data: T, source: SourceRef): ToolResult<T> {
  return { status: "ok", data, confidence: "high", source, warnings: [] };
}
function unavailable<T>(source: SourceRef): ToolResult<T> {
  return {
    status: "unavailable",
    data: null,
    confidence: "low",
    source,
    warnings: ["indisponible"],
  };
}

const GOOD_RISKS: RisksData = {
  summary: {
    inondation: { expose: false },
    argiles: { niveau: "faible" },
    sismicite: { zone: 1 },
    radon: { classe: 1 },
    cavites: { present: false },
    mouvementsTerrain: { present: false },
    sitesPollues: { nombre: 0, sites: [] },
  },
  catnat: [],
};

function baseInput(overrides: Partial<ConseillerInput> = {}): ConseillerInput {
  return {
    address: {
      label: "1 rue Test, Testville",
      lat: 48,
      lon: 2,
      citycode: "99999",
      postcode: "99999",
      city: "Testville",
      score: 1,
      type: "housenumber",
    },
    profile: { tags: [], propertyType: "maison" },
    listing: {},
    weights: computeDomainWeights({ tags: [], propertyType: "maison" }),
    risks: ok(GOOD_RISKS, SRC("risks")),
    prices: ok<PricesData>(
      { transactions: [], medianPriceM2: 3000, sampleSize: 10, coverageExcluded: false },
      SRC("prices"),
    ),
    air: ok<AirData>({ atmoIndex: 1, atmoLabel: "Bon", date: "2026-07-03" }, SRC("air")),
    crime: ok<CrimeData>(
      {
        commune: "99999",
        annee: 2025,
        indicateurs: [
          {
            indicateur: "Cambriolages de logement",
            tauxPour1000: 1.2,
            tendance: "stable",
            supprime: false,
          },
        ],
      },
      SRC("crime"),
    ),
    energy: ok<EnergyData>(
      {
        records: [],
        mostRecent: {
          etiquetteDpe: "B",
          etiquetteGes: "B",
          consommationKwhM2An: null,
          anneeConstruction: 2010,
          surfaceHabitable: 80,
          adresse: "x",
          dateDpe: "2024-01-01",
        },
      },
      SRC("energy"),
    ),
    redFlags: [],
    ...overrides,
  };
}

describe("composeReport", () => {
  it("produces a high score with all-favorable sections and no red flags", () => {
    const report = composeReport(baseInput());
    expect(report.globalScore).toBeGreaterThan(80);
    expect(report.sections).toHaveLength(5);
    expect(report.sections.every((s) => s.verdict === "favorable")).toBe(true);
    expect(report.redFlags).toHaveLength(0);
  });

  it("excludes indisponible domains from the score instead of penalizing them", () => {
    const report = composeReport(baseInput({ crime: unavailable(SRC("crime")) }));
    const securite = report.sections.find((s) => s.domain === "securite")!;
    expect(securite.verdict).toBe("indisponible");
    expect(report.globalScore).toBeGreaterThan(80); // still high — no penalty for a missing source
  });

  it("lowers the score when the Analyste raises red flags", () => {
    const withoutFlags = composeReport(baseInput());
    const withFlags = composeReport(
      baseInput({
        redFlags: [
          {
            id: "test-flag",
            title: "Test",
            severity: "alerte",
            domains: ["risques"],
            explanation: "test",
            sources: [SRC("risks")],
            confidence: "high",
          },
        ],
      }),
    );
    expect(withFlags.globalScore).toBeLessThan(withoutFlags.globalScore);
  });

  it("always includes the ERP official-step action", () => {
    const report = composeReport(baseInput());
    expect(
      report.actions.some((a) => a.category === "demarche_officielle" && a.title.includes("ERP")),
    ).toBe(true);
  });
});
