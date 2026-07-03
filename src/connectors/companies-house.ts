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
 * Companies House public register — ownership & control (PEOPLE dimension).
 * Requires a free API key (HTTP Basic, key as username, blank password).
 * Without it, an explicit "data gap / key missing" is returned.
 */

export const meta: ConnectorMeta = {
  id: "companies-house",
  name: "Companies House",
  dataset: "companies-house-register",
  endpoint: "https://api.company-information.service.gov.uk",
  licence: "OGL v3.0 (Companies House public register)",
  requiresKey: true,
};

const rawEnvelopeSchema = z.object({
  items: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const companyRecordSchema = z.object({
  companyNumber: z.string(),
  title: z.string(),
  companyStatus: z.string().nullable(),
  companyType: z.string().nullable(),
  addressSnippet: z.string().nullable(),
  dateOfCreation: z.string().nullable(),
  recordUrl: z.string(),
});
export type CompanyRecord = z.infer<typeof companyRecordSchema>;

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function searchCompanies(
  query: string,
  limit = 10,
): Promise<ConnectorResult<CompanyRecord>> {
  const key = env.COMPANIES_HOUSE_API_KEY;
  const url = `${meta.endpoint}/search/companies?q=${encodeURIComponent(query)}&items_per_page=${limit}`;

  if (!key) {
    return dataGapResult(
      meta,
      "key_missing",
      "Companies House needs a free API key (see .env.example / README). Ownership findings are unavailable until it is configured.",
      url,
    );
  }

  const fetched = await fetchJson(url, {
    sourceId: meta.id,
    cacheKey: url,
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
    },
    // Companies House rate limit: 600 requests / 5 minutes.
    minIntervalMs: 550,
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
      error: "Unexpected Companies House response shape",
    };
  }

  const records: CompanyRecord[] = [];
  for (const raw of envelope.data.items ?? []) {
    const companyNumber = str(raw["company_number"]);
    const title = str(raw["title"]);
    if (!companyNumber || !title) continue;
    records.push(
      companyRecordSchema.parse({
        companyNumber,
        title,
        companyStatus: str(raw["company_status"]),
        companyType: str(raw["company_type"]),
        addressSnippet: str(raw["address_snippet"]),
        dateOfCreation: str(raw["date_of_creation"]),
        recordUrl: `https://find-and-update.company-information.service.gov.uk/company/${companyNumber}`,
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
