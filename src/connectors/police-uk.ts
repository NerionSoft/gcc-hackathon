import { z } from "zod";
import { fetchJson } from "@/connectors/http";
import { toConnectorError } from "@/connectors/base";
import { okResult, type ConnectorMeta, type ConnectorResult } from "@/connectors/types";

/**
 * police.uk street-level crime, by month, within a small block-sized
 * polygon (~450 m square) around the point — the default lat/lng endpoint
 * uses a fixed 1-mile radius, which swamps urban blocks with thousands of
 * unrelated records. No key required. Used for the BLOCK-INCIDENT signal.
 * Data lags ~2 months.
 *
 * The connector returns one aggregate record per month (totals + category
 * breakdown), which is what the severity rubric consumes; per-incident raw
 * data stays in the response cache.
 */

export const meta: ConnectorMeta = {
  id: "police-uk",
  name: "police.uk street-level crime",
  dataset: "police-uk-street-crime",
  endpoint: "https://data.police.uk/api/crimes-street/all-crime",
  licence: "OGL v3.0",
  requiresKey: false,
};

const rawItemsSchema = z.array(z.record(z.string(), z.unknown()));

export const crimeSummarySchema = z.object({
  month: z.string(),
  totalIncidents: z.number(),
  byCategory: z.record(z.string(), z.number()),
  /** Up to five distinct street names with incidents, for readable findings. */
  sampleStreets: z.array(z.string()),
  recordUrl: z.string(),
});
export type CrimeSummary = z.infer<typeof crimeSummarySchema>;

/**
 * @param month "YYYY-MM"; police.uk publishes with ~2 months' lag.
 */
export async function streetCrimesNear(
  lat: number,
  lng: number,
  month: string,
): Promise<ConnectorResult<CrimeSummary>> {
  const dLat = 0.002; // ≈ 220 m
  const dLng = 0.0032;
  const poly = [
    `${lat - dLat},${lng - dLng}`,
    `${lat - dLat},${lng + dLng}`,
    `${lat + dLat},${lng + dLng}`,
    `${lat + dLat},${lng - dLng}`,
  ].join(":");
  const url = `${meta.endpoint}?poly=${poly}&date=${month}`;
  // police.uk asks for modest request rates on the open endpoint.
  const fetched = await fetchJson(url, { sourceId: meta.id, minIntervalMs: 600 });
  if (!fetched.ok) return toConnectorError(meta, fetched);

  const items = rawItemsSchema.safeParse(fetched.body);
  if (!items.success) {
    return {
      status: "error",
      dataset: meta.dataset,
      url: fetched.url,
      retrievedAt: fetched.retrievedAt,
      licence: meta.licence,
      fromCache: fetched.fromCache,
      error: "Unexpected police.uk response shape",
    };
  }

  const byCategory: Record<string, number> = {};
  const streets = new Set<string>();
  for (const raw of items.data) {
    const category = typeof raw["category"] === "string" ? raw["category"] : "unknown";
    byCategory[category] = (byCategory[category] ?? 0) + 1;
    const location = raw["location"] as { street?: { name?: unknown } } | undefined;
    if (typeof location?.street?.name === "string" && streets.size < 5) {
      streets.add(location.street.name);
    }
  }

  const summary = crimeSummarySchema.parse({
    month,
    totalIncidents: items.data.length,
    byCategory,
    sampleStreets: [...streets],
    recordUrl: fetched.url,
  });

  return okResult(
    {
      dataset: meta.dataset,
      url: fetched.url,
      licence: meta.licence,
      fromCache: fetched.fromCache,
    },
    // A month with zero incidents is still a real, sourced observation.
    [summary],
  );
}
