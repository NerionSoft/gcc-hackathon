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
 * Energy Performance Certificates — MHCLG "Get energy performance data"
 * service (successor to epc.opendatacommunities.org, which now 301s).
 * Requires a free bearer token (GOV.UK One Login account → "my account"
 * page). Without it, this connector reports an explicit "data gap /
 * key missing" — it never fabricates energy data.
 */

export const meta: ConnectorMeta = {
  id: "epc",
  name: "Energy Performance Certificates (MHCLG)",
  dataset: "epc-domestic",
  endpoint: "https://api.get-energy-performance-data.communities.gov.uk/api/domestic/search",
  licence: "OGL v3.0 (contains EPC data © Crown copyright)",
  requiresKey: true,
};

const rawEnvelopeSchema = z.object({
  data: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const epcRecordSchema = z.object({
  certificateNumber: z.string(),
  address: z.string(),
  postcode: z.string(),
  currentEnergyBand: z.string(),
  registrationDate: z.string().nullable(),
  recordUrl: z.string(),
});
export type EpcRecord = z.infer<typeof epcRecordSchema>;

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function searchCertificatesByPostcode(
  postcode: string,
  pageSize = 25,
): Promise<ConnectorResult<EpcRecord>> {
  const key = env.EPC_API_KEY;
  const url = `${meta.endpoint}?postcode=${encodeURIComponent(postcode)}&page=${pageSize}`;

  if (!key) {
    return dataGapResult(
      meta,
      "key_missing",
      "EPC open data needs a free bearer token from get-energy-performance-data.communities.gov.uk (see .env.example / README). Energy findings are unavailable until it is configured.",
      url,
    );
  }

  const fetched = await fetchJson(url, {
    sourceId: meta.id,
    cacheKey: url, // token never enters the cache key
    headers: { Authorization: `Bearer ${key}`, accept: "application/json" },
    // Service rate limit: 6,000 requests / 5 minutes / IP — stay well under.
    minIntervalMs: 400,
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
  for (const row of envelope.data.data ?? []) {
    const certificateNumber = str(row["certificateNumber"]);
    const band = str(row["currentEnergyEfficiencyBand"]);
    if (!certificateNumber || !band) continue;
    const address = [row["addressLine1"], row["addressLine2"], row["postTown"]]
      .map((part) => (typeof part === "string" ? part : ""))
      .filter(Boolean)
      .join(", ");
    records.push(
      epcRecordSchema.parse({
        certificateNumber,
        address: address || "(address withheld)",
        postcode: str(row["postcode"]) ?? postcode,
        currentEnergyBand: band,
        registrationDate: str(row["registrationDate"]),
        recordUrl: `https://api.get-energy-performance-data.communities.gov.uk/api/certificate?certificate_number=${certificateNumber}`,
      }),
    );
  }

  return okResult(
    { dataset: meta.dataset, url: fetched.url, licence: meta.licence, fromCache: fetched.fromCache },
    records,
  );
}
