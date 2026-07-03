import { z } from "zod";
import { fetchJson } from "@/connectors/http";
import { toConnectorError } from "@/connectors/base";
import { okResult, type ConnectorMeta, type ConnectorResult } from "@/connectors/types";

/**
 * UK House Price Index (HM Land Registry / ONS) by local-authority region.
 * No key required. Used for MARKET price-trend and liquidity signals.
 */

export const meta: ConnectorMeta = {
  id: "land-registry-ukhpi",
  name: "UK House Price Index (HM Land Registry)",
  dataset: "uk-house-price-index",
  endpoint: "https://landregistry.data.gov.uk/data/ukhpi",
  licence: "OGL v3.0",
  requiresKey: false,
};

const rawEnvelopeSchema = z.object({
  result: z.object({
    primaryTopic: z.record(z.string(), z.unknown()),
  }),
});

export const ukhpiRecordSchema = z.object({
  recordUri: z.string(),
  region: z.string(),
  month: z.string(),
  averagePrice: z.number().nullable(),
  housePriceIndex: z.number().nullable(),
  percentageAnnualChange: z.number().nullable(),
  salesVolume: z.number().nullable(),
});
export type UkhpiRecord = z.infer<typeof ukhpiRecordSchema>;

function num(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/**
 * @param regionSlug UKHPI region slug, e.g. "brighton-and-hove", "city-of-kingston-upon-hull".
 * @param month "YYYY-MM"
 */
export async function getMonthlyIndicators(
  regionSlug: string,
  month: string,
): Promise<ConnectorResult<UkhpiRecord>> {
  const url = `${meta.endpoint}/region/${encodeURIComponent(regionSlug)}/month/${month}.json`;
  // landregistry.data.gov.uk rate-limits aggressively — keep a gentle pace.
  const fetched = await fetchJson(url, { sourceId: meta.id, minIntervalMs: 1_200 });
  if (!fetched.ok) return toConnectorError(meta, fetched);

  const envelope = rawEnvelopeSchema.safeParse(fetched.body);
  if (!envelope.success) {
    return {
      status: "error",
      dataset: meta.dataset,
      url: fetched.url,
      retrievedAt: fetched.retrievedAt,
      licence: meta.licence,
      fromCache: fetched.fromCache,
      error: "Unexpected UKHPI response shape",
    };
  }

  const topic = envelope.data.result.primaryTopic;
  const record = ukhpiRecordSchema.parse({
    recordUri: typeof topic["_about"] === "string" ? topic["_about"] : fetched.url,
    region: regionSlug,
    month,
    averagePrice: num(topic["averagePrice"]),
    housePriceIndex: num(topic["housePriceIndex"]),
    percentageAnnualChange: num(topic["percentageAnnualChange"]),
    salesVolume: num(topic["salesVolume"]),
  });

  const hasData =
    record.averagePrice !== null || record.housePriceIndex !== null || record.salesVolume !== null;

  return okResult(
    {
      dataset: meta.dataset,
      url: fetched.url,
      licence: meta.licence,
      fromCache: fetched.fromCache,
    },
    hasData ? [record] : [],
  );
}
