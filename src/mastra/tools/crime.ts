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
    name: "SSMSI (ministère de l'Intérieur) — bases communales de la délinquance enregistrée",
    url: "https://www.data.gouv.fr/datasets/bases-statistiques-communale-departementale-et-regionale-de-la-delinquance-enregistree-par-la-police-et-la-gendarmerie-nationales/",
    retrievedAt: new Date().toISOString(),
    datasetVintage: "géographie 2025, produit le 2026-02-03",
  };
}

export const crimeInputSchema = z.object({ citycode: z.string() });
export const crimeOutputSchema = toolResultSchema(crimeDataSchema);

export const crimeTool = createTool({
  id: "crime-ssmsi",
  description:
    "Statistiques communales annuelles de délinquance enregistrée (SSMSI), en taux pour 1000 habitants avec tendance — jamais une carte du crime rue par rue.",
  inputSchema: crimeInputSchema,
  outputSchema: crimeOutputSchema,
  execute: async ({ citycode }): Promise<z.infer<typeof crimeOutputSchema>> => {
    const source = ssmsiSource();
    const index = loadIndex();
    if (!index) {
      return errorResult(
        source,
        "Index SSMSI local introuvable — exécutez `pnpm fetch-data` pour le générer.",
      );
    }

    // Unlike some Géorisques sub-datasets, SSMSI genuinely publishes real
    // per-arrondissement rows for Paris/Lyon/Marseille (verified: distinct,
    // finer-grained counts from the whole-city aggregate) — use it as-is.
    const entry = index[citycode];
    if (!entry) {
      return unavailableResult(source, "Aucune donnée SSMSI pour cette commune.");
    }

    const data: CrimeData = {
      commune: citycode,
      annee: entry.annee,
      indicateurs: entry.indicateurs.map((i) => ({
        indicateur: i.indicateur,
        tauxPour1000: i.diffuse ? i.tauxPour1000 : null,
        tendance: i.trend,
        supprime: !i.diffuse,
      })),
    };
    const suppressedCount = data.indicateurs.filter((i) => i.supprime).length;
    const warnings =
      suppressedCount > 0
        ? [
            `${suppressedCount} indicateur(s) non diffusé(s) (moins de 5 faits enregistrés sur 3 années successives).`,
          ]
        : [];
    return okResult(data, source, "high", warnings);
  },
});
