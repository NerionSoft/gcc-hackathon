import { z } from "zod";
import { fetchJson } from "@/connectors/http";
import { toConnectorError } from "@/connectors/base";
import { okResult, type ConnectorMeta, type ConnectorResult } from "@/connectors/types";

/**
 * police.uk street-level crime around a point (1-mile radius), by month.
 * No key required. Used for the BLOCK-INCIDENT signal. Data lags ~2 months.
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

export const streetCrimeSchema = z.object({
  id: z.number(),
  category: z.string(),
  month: z.string(),
  streetName: z.string().nullable(),
  outcome: z.string().nullable(),
  recordUrl: z.string(),
});
export type StreetCrime = z.infer<typeof streetCrimeSchema>;

/**
 * @param month "YYYY-MM"; police.uk publishes with ~2 months' lag.
 */
export async function streetCrimesNear(
  lat: number,
  lng: number,
  month: string,
): Promise<ConnectorResult<StreetCrime>> {
  const url = `${meta.endpoint}?lat=${lat}&lng=${lng}&date=${month}`;
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

  const records: StreetCrime[] = [];
  for (const raw of items.data) {
    const id = typeof raw["id"] === "number" ? raw["id"] : null;
    const category = typeof raw["category"] === "string" ? raw["category"] : null;
    if (id === null || !category) continue;
    const location = raw["location"] as { street?: { name?: unknown } } | undefined;
    const streetName = typeof location?.street?.name === "string" ? location.street.name : null;
    const outcomeStatus = raw["outcome_status"] as { category?: unknown } | null | undefined;
    records.push(
      streetCrimeSchema.parse({
        id,
        category,
        month: typeof raw["month"] === "string" ? raw["month"] : month,
        streetName,
        outcome: typeof outcomeStatus?.category === "string" ? outcomeStatus.category : null,
        recordUrl: `https://data.police.uk/api/crimes-street/all-crime?lat=${lat}&lng=${lng}&date=${month}#${id}`,
      }),
    );
  }

  return okResult(
    {
      dataset: meta.dataset,
      url: fetched.url,
      licence: meta.licence,
      fromCache: fetched.fromCache,
    },
    records,
  );
}
