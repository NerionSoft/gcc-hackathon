import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  crimeDataSchema,
  toolResultSchema,
  okResult,
  unavailableResult,
  errorResult,
  type CrimeData,
  type SourceRef,
} from "@/types";

/**
 * SSMSI only publishes this as a ~40MB national CSV.gz updated twice a year
 * (no live query API) — streaming and filtering it takes ~20s, so
 * `scripts/fetch-ssmsi.ts` pre-builds a small per-commune index (see
 * package.json's `fetch-data` script) that we just read synchronously here.
 */
const INDEX_PATH = path.join(process.cwd(), "data", "ssmsi", "index.json.gz");

interface IndexEntry {
  annee: number;
  indicateurs: {
    indicateur: string;
    nombre: number | null;
    tauxPour1000: number | null;
    diffuse: boolean;
    trend: "hausse" | "baisse" | "stable" | null;
  }[];
}

let cachedIndex: Record<string, IndexEntry> | null | undefined;

function loadIndex(): Record<string, IndexEntry> | null {
  if (cachedIndex !== undefined) return cachedIndex;
  try {
    const buf = readFileSync(INDEX_PATH);
    cachedIndex = JSON.parse(gunzipSync(buf).toString("utf-8")) as Record<string, IndexEntry>;
  } catch {
    cachedIndex = null;
  }
  return cachedIndex ?? null;
}

function ssmsiSource(): SourceRef {
  return {
    name: "SSMSI (Ministry of the Interior) — communal crime statistics",
    url: "https://www.data.gouv.fr/datasets/bases-statistiques-communale-departementale-et-regionale-de-la-delinquance-enregistree-par-la-police-et-la-gendarmerie-nationales/",
    retrievedAt: new Date().toISOString(),
    datasetVintage: "2025 geography, published 2026-02-03",
  };
}

/** SSMSI's 15 published indicator names are a fixed French vocabulary from the source dataset. */
const INDICATOR_TRANSLATIONS: Record<string, string> = {
  "Violences physiques intrafamiliales": "Domestic physical violence",
  "Violences physiques hors cadre familial": "Physical violence outside the family",
  "Violences sexuelles": "Sexual violence",
  "Vols avec armes": "Armed robbery",
  "Vols violents sans arme": "Violent theft without a weapon",
  "Vols sans violence contre des personnes": "Non-violent theft against persons",
  "Cambriolages de logement": "Home burglaries",
  "Vols de véhicule": "Vehicle theft",
  "Vols dans les véhicules": "Theft from vehicles",
  "Vols d'accessoires sur véhicules": "Theft of vehicle accessories",
  "Destructions et dégradations volontaires": "Intentional destruction and vandalism",
  "Usage de stupéfiants": "Drug use",
  "Usage de stupéfiants (AFD)": "Drug use (fixed penalty)",
  "Trafic de stupéfiants": "Drug trafficking",
  "Escroqueries et fraudes aux moyens de paiement": "Fraud and payment-method scams",
};

function translateIndicator(label: string): string {
  return INDICATOR_TRANSLATIONS[label] ?? label;
}

export const crimeInputSchema = z.object({ citycode: z.string() });
export const crimeOutputSchema = toolResultSchema(crimeDataSchema);

export const crimeTool = createTool({
  id: "crime-ssmsi",
  description:
    "Annual communal crime statistics (SSMSI), as a rate per 1000 residents with trend — never a street-by-street crime map.",
  inputSchema: crimeInputSchema,
  outputSchema: crimeOutputSchema,
  execute: async ({ citycode }): Promise<z.infer<typeof crimeOutputSchema>> => {
    const source = ssmsiSource();
    const index = loadIndex();
    if (!index) {
      return errorResult(
        source,
        "Local SSMSI index not found — run `pnpm fetch-data` to generate it.",
      );
    }

    // Unlike some Géorisques sub-datasets, SSMSI genuinely publishes real
    // per-arrondissement rows for Paris/Lyon/Marseille (verified: distinct,
    // finer-grained counts from the whole-city aggregate) — use it as-is.
    const entry = index[citycode];
    if (!entry) {
      return unavailableResult(source, "No SSMSI data for this commune.");
    }

    const data: CrimeData = {
      commune: citycode,
      annee: entry.annee,
      indicateurs: entry.indicateurs.map((i) => ({
        indicateur: translateIndicator(i.indicateur),
        tauxPour1000: i.diffuse ? i.tauxPour1000 : null,
        tendance: i.trend,
        supprime: !i.diffuse,
      })),
    };
    const suppressedCount = data.indicateurs.filter((i) => i.supprime).length;
    const warnings =
      suppressedCount > 0
        ? [
            `${suppressedCount} indicator(s) not published (fewer than 5 recorded incidents over 3 consecutive years).`,
          ]
        : [];
    return okResult(data, source, "high", warnings);
  },
});
