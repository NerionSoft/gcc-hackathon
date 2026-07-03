import { z } from "zod";
import { env } from "@/infrastructure/config/env";
import { fetchJson } from "@/connectors/http";
import { toConnectorError } from "@/connectors/base";
import {
  dataGapResult,
  okResult,
  type ConnectorMeta,
  type ConnectorResult,
} from "@/connectors/types";

/**
 * Energy Performance Certificates (MHCLG, epc.opendatacommunities.org).
 * Requires a free API key. Without it, this connector reports an explicit
 * "data gap / key missing" — it never fabricates energy data.
 *
 * EPC_API_KEY format: base64("registered-email:api-key") — used as
 * `Authorization: Basic <EPC_API_KEY>`.
 */

export const meta: ConnectorMeta = {
  id: "epc",
  name: "Energy Performance Certificates (MHCLG)",
  dataset: "epc-domestic",
  endpoint: "https://epc.opendatacommunities.org/api/v1/domestic/search",
  licence: "OGL v3.0 (attribution: contains EPC data © Crown copyright)",
  requiresKey: true,
};

const rawEnvelopeSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const epcRecordSchema = z.object({
  lmkKey: z.string(),
  address: z.string(),
  postcode: z.string(),
  currentEnergyRating: z.string(),
  potentialEnergyRating: z.string().nullable(),
  inspectionDate: z.string().nullable(),
  propertyType: z.string().nullable(),
});
export type EpcRecord = z.infer<typeof epcRecordSchema>;

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function searchCertificatesByPostcode(
  postcode: string,
  limit = 25,
): Promise<ConnectorResult<EpcRecord>> {
  const key = env.EPC_API_KEY;
  const url = `${meta.endpoint}?postcode=${encodeURIComponent(postcode)}&size=${limit}`;

  if (!key) {
    return dataGapResult(
      meta,
      "key_missing",
      "EPC open data needs a free API key (see .env.example / README). Energy findings are unavailable until it is configured.",
      url,
    );
  }

  const fetched = await fetchJson(url, {
    sourceId: meta.id,
    cacheKey: url, // key never enters the cache key
    headers: { Authorization: `Basic ${key}`, accept: "application/json" },
  });
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
      error: "Unexpected EPC response shape",
    };
  }

  const records: EpcRecord[] = [];
  for (const row of envelope.data.rows ?? []) {
    const lmkKey = str(row["lmk-key"]);
    const address = str(row["address"]);
    const rating = str(row["current-energy-rating"]);
    if (!lmkKey || !address || !rating) continue;
    records.push(
      epcRecordSchema.parse({
        lmkKey,
        address,
        postcode: str(row["postcode"]) ?? postcode,
        currentEnergyRating: rating,
        potentialEnergyRating: str(row["potential-energy-rating"]),
        inspectionDate: str(row["inspection-date"]),
        propertyType: str(row["property-type"]),
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
