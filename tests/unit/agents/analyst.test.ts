import { describe, it, expect } from "vitest";
import { analyzeCrossRules, type AnalystInput } from "@/mastra/agents/analyst";
import type {
  SourceRef,
  ToolResult,
  RisksData,
  PricesData,
  AirData,
  CrimeData,
  EnergyData,
  UserProfile,
} from "@/types";

const SRC = (name: string): SourceRef => ({
  name,
  url: `https://example.test/${name}`,
  retrievedAt: "2026-07-03T00:00:00.000Z",
});

function ok<T>(data: T, source: SourceRef): ToolResult<T> {
  return { status: "ok", data, confidence: "high", source, warnings: [] };
}

const BASE_RISKS: RisksData = {
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

const BASE_PRICES: PricesData = {
  transactions: [],
  medianPriceM2: 3000,
  sampleSize: 10,
  coverageExcluded: false,
};
const BASE_AIR: AirData = { atmoIndex: 2, atmoLabel: "Bon", date: "2026-07-03" };
const BASE_CRIME: CrimeData = { commune: "29081", annee: 2025, indicateurs: [] };
const BASE_ENERGY: EnergyData = { records: [], mostRecent: null };
const BASE_PROFILE: UserProfile = { tags: [], propertyType: "maison" };

function baseInput(overrides: Partial<AnalystInput> = {}): AnalystInput {
  return {
    risks: ok(BASE_RISKS, SRC("risks")),
    prices: ok(BASE_PRICES, SRC("prices")),
    air: ok(BASE_AIR, SRC("air")),
    crime: ok(BASE_CRIME, SRC("crime")),
    energy: ok(BASE_ENERGY, SRC("energy")),
    profile: BASE_PROFILE,
    listing: {},
    ...overrides,
  };
}

describe("analyzeCrossRules", () => {
  it("returns no findings when nothing unusual is detected", () => {
    const findings = analyzeCrossRules(baseInput());
    expect(findings).toHaveLength(0);
  });

  it("R1: flags structural risk for argile fort + catnat sécheresse + old house", () => {
    const input = baseInput({
      risks: ok(
        {
          ...BASE_RISKS,
          summary: { ...BASE_RISKS.summary, argiles: { niveau: "fort" } },
          catnat: [
            {
              libelleRisqueJo: "Sécheresse",
              dateDebut: "2020",
              dateFin: "2020",
              dateArrete: "2020",
              dateJo: null,
            },
          ],
        },
        SRC("risks"),
      ),
      energy: ok(
        {
          records: [],
          mostRecent: {
            etiquetteDpe: "D",
            etiquetteGes: "D",
            consommationKwhM2An: null,
            anneeConstruction: 1960,
            surfaceHabitable: 100,
            adresse: "x",
            dateDpe: "2024-01-01",
          },
        },
        SRC("energy"),
      ),
    });

    const findings = analyzeCrossRules(input);
    expect(findings.map((f) => f.id)).toContain("argile-secheresse-maison-ancienne");
    const finding = findings.find((f) => f.id === "argile-secheresse-maison-ancienne")!;
    expect(finding.severity).toBe("alerte");
    expect(finding.domains).toEqual(["risques", "energie"]);
  });

  it("does not fire R1 for an apartment (only houses have this structural exposure)", () => {
    const input = baseInput({
      profile: { tags: [], propertyType: "appartement" },
      risks: ok(
        {
          ...BASE_RISKS,
          summary: { ...BASE_RISKS.summary, argiles: { niveau: "fort" } },
          catnat: [
            {
              libelleRisqueJo: "Sécheresse",
              dateDebut: "2020",
              dateFin: "2020",
              dateArrete: "2020",
              dateJo: null,
            },
          ],
        },
        SRC("risks"),
      ),
      energy: ok(
        {
          records: [],
          mostRecent: {
            etiquetteDpe: "D",
            etiquetteGes: "D",
            consommationKwhM2An: null,
            anneeConstruction: 1960,
            surfaceHabitable: 100,
            adresse: "x",
            dateDpe: "2024-01-01",
          },
        },
        SRC("energy"),
      ),
    });

    expect(analyzeCrossRules(input).map((f) => f.id)).not.toContain(
      "argile-secheresse-maison-ancienne",
    );
  });

  it("R2: flags overvaluation for a poor DPE priced above the local median", () => {
    const input = baseInput({
      energy: ok(
        {
          records: [],
          mostRecent: {
            etiquetteDpe: "G",
            etiquetteGes: "F",
            consommationKwhM2An: null,
            anneeConstruction: 2000,
            surfaceHabitable: 50,
            adresse: "x",
            dateDpe: "2024-01-01",
          },
        },
        SRC("energy"),
      ),
      listing: { askingPrice: 200_000, askingSurface: 50 }, // 4000 €/m², median is 3000
    });

    const findings = analyzeCrossRules(input);
    expect(findings.map((f) => f.id)).toContain("dpe-mauvais-prix-eleve");
  });

  it("R5: flags the market/risk contradiction when CatNat history repeats but prices hold", () => {
    const transactions = [
      ...Array.from({ length: 4 }, (_, i) => ({
        dateMutation: `2021-0${i + 1}-01`,
        prixM2: 3000,
        valeurFonciere: 1,
        surfaceReelleBati: 1,
        typeLocal: "maison" as const,
        lat: 0,
        lon: 0,
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        dateMutation: `2026-0${i + 1}-01`,
        prixM2: 3300,
        valeurFonciere: 1,
        surfaceReelleBati: 1,
        typeLocal: "maison" as const,
        lat: 0,
        lon: 0,
      })),
    ];
    const input = baseInput({
      risks: ok(
        {
          ...BASE_RISKS,
          catnat: Array.from({ length: 3 }, () => ({
            libelleRisqueJo: "Inondation",
            dateDebut: "2018",
            dateFin: "2018",
            dateArrete: "2018",
            dateJo: null,
          })),
        },
        SRC("risks"),
      ),
      prices: ok(
        { transactions, medianPriceM2: 3100, sampleSize: 8, coverageExcluded: false },
        SRC("prices"),
      ),
    });

    const findings = analyzeCrossRules(input);
    expect(findings.map((f) => f.id)).toContain("catnat-repete-prix-stables");
  });

  it("never crashes when every tool result is unavailable", () => {
    const unavailable = <T>(source: SourceRef): ToolResult<T> => ({
      status: "unavailable",
      data: null,
      confidence: "low",
      source,
      warnings: [],
    });
    const input: AnalystInput = {
      risks: unavailable(SRC("risks")),
      prices: unavailable(SRC("prices")),
      air: unavailable(SRC("air")),
      crime: unavailable(SRC("crime")),
      energy: unavailable(SRC("energy")),
      profile: BASE_PROFILE,
      listing: {},
    };
    expect(() => analyzeCrossRules(input)).not.toThrow();
  });
});
