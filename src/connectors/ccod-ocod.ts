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
 * HM Land Registry CCOD (UK companies that own property) & OCOD (overseas
 * companies that own property) — the civic-transparency jewel for the
 * PEOPLE dimension.
 *
 * These are monthly bulk datasets behind the free "Use land and property
 * data" service; a free API key lists and signs download links. Without a
 * key this connector reports an explicit "data gap / key missing".
 */

export const meta: ConnectorMeta = {
  id: "ccod-ocod",
  name: "Land Registry CCOD / OCOD corporate ownership",
  dataset: "land-registry-ccod-ocod",
  endpoint: "https://use-land-property-data.service.gov.uk/api/v1/datasets",
  licence: "HM Land Registry Free Datasets Licence (CCOD/OCOD)",
  requiresKey: true,
};

const rawEnvelopeSchema = z.object({
  success: z.boolean().optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  dataset: z.record(z.string(), z.unknown()).optional(),
});

export const ccodDatasetInfoSchema = z.object({
  datasetId: z.enum(["ccod", "ocod"]),
  name: z.string(),
  lastUpdated: z.string().nullable(),
  recordUrl: z.string(),
});
export type CcodDatasetInfo = z.infer<typeof ccodDatasetInfoSchema>;

/**
 * Metadata for the CCOD or OCOD dataset (proves availability/freshness).
 * Per-title lookups need the monthly bulk file, which we do not download
 * in the demo pipeline — that limitation is documented in the README.
 */
export async function getDatasetInfo(
  datasetId: "ccod" | "ocod",
): Promise<ConnectorResult<CcodDatasetInfo>> {
  const key = env.LR_DATA_API_KEY;
  const url = `${meta.endpoint}/${datasetId}`;

  if (!key) {
    return dataGapResult(
      meta,
      "key_missing",
      "Land Registry CCOD/OCOD needs a free 'Use land and property data' API key (see .env.example / README). Corporate-ownership findings are unavailable until it is configured.",
      url,
    );
  }

  const fetched = await fetchJson(url, {
    sourceId: meta.id,
    cacheKey: url,
    headers: { Authorization: key },
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
      error: "Unexpected use-land-property-data response shape",
    };
  }

  const details = envelope.data.result ?? envelope.data.dataset ?? {};
  const lastUpdated =
    typeof details["last_updated"] === "string"
      ? details["last_updated"]
      : typeof details["published_date"] === "string"
        ? details["published_date"]
        : null;

  return okResult(
    {
      dataset: meta.dataset,
      url: fetched.url,
      licence: meta.licence,
      fromCache: fetched.fromCache,
    },
    [
      ccodDatasetInfoSchema.parse({
        datasetId,
        name:
          datasetId === "ccod"
            ? "UK companies that own property in England and Wales"
            : "Overseas companies that own property in England and Wales",
        lastUpdated,
        recordUrl: fetched.url,
      }),
    ],
  );
}
