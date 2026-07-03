import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { fetchJson } from "@/lib/http";
import { withCache } from "@/lib/cache";
import {
  energyDataSchema,
  toolResultSchema,
  okResult,
  unavailableResult,
  errorResult,
  type EnergyData,
  type SourceRef,
  type DpeRecord,
} from "@/types";

/**
 * ADEME's DPE data now lives on a Data Fair (Koumoul) platform, not the
 * Opendatasoft API older docs describe. Dataset "dpe03existant" covers
 * existing-building diagnostics since the July 2021 methodology reform
 * (post-2021 DPEs only — pre-2021 DPEs used a since-discredited "3CL"
 * method and live in a separate legacy dataset we don't query).
 */
const ADEME_BASE = "https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines";
const RADIUS_M = 50;
const FIELDS = [
  "numero_dpe",
  "etiquette_dpe",
  "etiquette_ges",
  "annee_construction",
  "surface_habitable_logement",
  "adresse_ban",
  "date_etablissement_dpe",
].join(",");

interface AdemeRow {
  numero_dpe: string;
  etiquette_dpe: string;
  etiquette_ges: string;
  annee_construction?: number;
  surface_habitable_logement?: number;
  adresse_ban: string;
  date_etablissement_dpe: string;
}
interface AdemeResponse {
  total: number;
  results: AdemeRow[];
}

function toDpeRecord(row: AdemeRow): DpeRecord {
  return {
    etiquetteDpe: row.etiquette_dpe as DpeRecord["etiquetteDpe"],
    etiquetteGes: row.etiquette_ges as DpeRecord["etiquetteGes"],
    consommationKwhM2An: null,
    anneeConstruction: row.annee_construction ?? null,
    surfaceHabitable: row.surface_habitable_logement ?? null,
    adresse: row.adresse_ban,
    dateDpe: row.date_etablissement_dpe,
  };
}

function ademeSource(url: string): SourceRef {
  return {
    name: "ADEME — Energy Performance Diagnostics (DPE)",
    url,
    retrievedAt: new Date().toISOString(),
  };
}

export const energyInputSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  housenumber: z.string().optional(),
  street: z.string().optional(),
});
export const energyOutputSchema = toolResultSchema(energyDataSchema);

export const energyTool = createTool({
  id: "energy-ademe-dpe",
  description: "Energy performance diagnostics (ADEME) for the building nearest the address.",
  inputSchema: energyInputSchema,
  outputSchema: energyOutputSchema,
  execute: async ({ lat, lon, housenumber }): Promise<z.infer<typeof energyOutputSchema>> => {
    const url = `${ADEME_BASE}?geo_distance=${lon},${lat},${RADIUS_M}&select=${FIELDS}&size=30&sort=-date_etablissement_dpe`;
    const source = ademeSource(url);

    let response: AdemeResponse;
    try {
      response = await withCache(
        `energy:${lat}:${lon}`,
        { ttlMs: 24 * 3600 * 1000, disk: true },
        () => fetchJson<AdemeResponse>(url, { timeoutMs: 8000, retries: 2 }),
      );
    } catch (err) {
      return errorResult(
        source,
        `ADEME DPE unavailable: ${err instanceof Error ? err.message : "error"}.`,
      );
    }

    if (response.results.length === 0) {
      return unavailableResult(source, "No energy performance diagnostic found near this address.");
    }

    const warnings: string[] = [];
    let matched = response.results;
    if (housenumber) {
      const sameBuilding = response.results.filter((r) =>
        r.adresse_ban.trim().toUpperCase().startsWith(`${housenumber.toUpperCase()} `),
      );
      if (sameBuilding.length > 0) {
        matched = sameBuilding;
      } else {
        warnings.push(
          "No diagnostic found at this exact house number — using the diagnostic from the immediate neighbourhood instead.",
        );
      }
    }

    const records = matched.map(toDpeRecord);
    const data: EnergyData = { records: records.slice(0, 10), mostRecent: records[0] ?? null };
    if (matched.length > 1) {
      warnings.push(
        `${matched.length} diagnostics found for this building (multi-unit) — the most recent one is used.`,
      );
    }
    return okResult(
      data,
      source,
      matched === response.results && housenumber ? "medium" : "high",
      warnings,
    );
  },
});
