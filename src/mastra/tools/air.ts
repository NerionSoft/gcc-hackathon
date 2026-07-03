import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { fetchJson } from "@/lib/http";
import { withCache } from "@/lib/cache";
import {
  airDataSchema,
  toolResultSchema,
  okResult,
  unavailableResult,
  errorResult,
  type AirData,
  type SourceRef,
} from "@/types";

/**
 * Atmo Data's own REST API is authenticated (JWT login, approval-gated
 * registration) — but the same daily ATMO index is published unauthenticated
 * via this GeoServer WFS layer, verified live. Geod'air's fine-grained
 * pollutant API is behind a similar registration gate with no practical
 * unauthenticated equivalent, so per-pollutant breakdowns (pm25/pm10/...)
 * are simply omitted rather than faked — see the méthodologie page.
 */
const ATMO_WFS_URL = "https://data.atmo-france.org/geoserver/ind/ows";
const TTL_MS = 60 * 60 * 1000; // air changes daily — never disk-cached, short in-memory TTL only.

interface AtmoFeature {
  properties: {
    code_qual: number;
    lib_qual: string;
    date_ech: string;
    lib_zone: string;
  };
}
interface AtmoResponse {
  features: AtmoFeature[];
}

function atmoSource(url: string): SourceRef {
  return {
    name: "Atmo Data (fédération des AASQA, indice ATMO)",
    url,
    retrievedAt: new Date().toISOString(),
  };
}

export const airInputSchema = z.object({ citycode: z.string() });
export const airOutputSchema = toolResultSchema(airDataSchema);

export const airTool = createTool({
  id: "air-atmo",
  description:
    "Indice ATMO quotidien de qualité de l'air pour une commune (Atmo Data, réseau des AASQA).",
  inputSchema: airInputSchema,
  outputSchema: airOutputSchema,
  execute: async ({ citycode }): Promise<z.infer<typeof airOutputSchema>> => {
    const url = `${ATMO_WFS_URL}?service=WFS&request=GetFeature&TypeNames=ind_atmo_2021&outputformat=json&CQL_FILTER=code_zone='${citycode}'`;
    const source = atmoSource(url);
    try {
      const data = await withCache(`air:${citycode}`, { ttlMs: TTL_MS }, () =>
        fetchJson<AtmoResponse>(url, { timeoutMs: 6000, retries: 2 }),
      );
      if (data.features.length === 0) {
        return unavailableResult(
          source,
          "Indice ATMO non diffusé pour cette commune — probablement hors couverture du réseau de mesure local (communes rurales notamment).",
        );
      }
      const today = new Date().toISOString().slice(0, 10);
      const feature =
        data.features.find((f) => f.properties.date_ech === today) ?? data.features[0];
      const p = feature.properties;
      const result: AirData = {
        atmoIndex: p.code_qual,
        atmoLabel: p.lib_qual,
        date: p.date_ech,
        nearestStation: p.lib_zone,
      };
      const warnings =
        p.code_qual === 0 ? ["Aucune mesure disponible pour la date la plus récente."] : [];
      return okResult(result, source, "high", warnings);
    } catch (err) {
      return errorResult(
        source,
        `Atmo Data indisponible : ${err instanceof Error ? err.message : "erreur"}.`,
      );
    }
  },
});
