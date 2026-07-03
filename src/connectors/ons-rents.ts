import { z } from "zod";
import { fetchJson } from "@/connectors/http";
import { toConnectorError } from "@/connectors/base";
import { okResult, type ConnectorMeta, type ConnectorResult } from "@/connectors/types";

/**
 * ONS Index of Private Housing Rental Prices (IPHRP) by English region.
 * No key required. Used for the MARKET rent-stress signal.
 */

export const meta: ConnectorMeta = {
  id: "ons-rents",
  name: "ONS Index of Private Housing Rental Prices",
  dataset: "ons-private-housing-rental-prices",
  endpoint:
    "https://api.beta.ons.gov.uk/v1/datasets/index-private-housing-rental-prices/editions/time-series",
  licence: "OGL v3.0",
  requiresKey: false,
};

const rawEnvelopeSchema = z.object({
  observations: z
    .array(
      z.object({
        observation: z.string(),
        dimensions: z
          .object({
            time: z.object({ id: z.string().optional(), label: z.string().optional() }).optional(),
            Time: z.object({ id: z.string().optional(), label: z.string().optional() }).optional(),
          })
          .partial()
          .optional(),
      }),
    )
    .optional(),
});

export const rentIndexRecordSchema = z.object({
  recordUri: z.string(),
  regionCode: z.string(),
  month: z.string(),
  rentalPriceIndex: z.number(),
});
export type RentIndexRecord = z.infer<typeof rentIndexRecordSchema>;

/**
 * @param regionCode ONS administrative geography code, e.g. "E12000008" (South East).
 */
export async function getRentalIndex(
  regionCode: string,
  latestVersion = 41,
): Promise<ConnectorResult<RentIndexRecord>> {
  const url =
    `${meta.endpoint}/versions/${latestVersion}/observations` +
    `?time=*&geography=${encodeURIComponent(regionCode)}&indexandyearchange=index`;
  const fetched = await fetchJson(url, { sourceId: meta.id });
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
      error: "Unexpected ONS observations response shape",
    };
  }

  const records: RentIndexRecord[] = [];
  for (const obs of envelope.data.observations ?? []) {
    const value = Number.parseFloat(obs.observation);
    const month = obs.dimensions?.time?.label ?? obs.dimensions?.Time?.label;
    if (!Number.isFinite(value) || !month) continue;
    records.push(
      rentIndexRecordSchema.parse({
        recordUri: fetched.url,
        regionCode,
        month,
        rentalPriceIndex: value,
      }),
    );
  }
  // Latest observations last, so callers can diff the tail for rent stress.
  records.sort((a, b) => a.month.localeCompare(b.month));

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
