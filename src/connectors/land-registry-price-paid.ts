import { z } from "zod";
import { fetchJson } from "@/connectors/http";
import { toConnectorError } from "@/connectors/base";
import { okResult, type ConnectorMeta, type ConnectorResult } from "@/connectors/types";

/**
 * HM Land Registry Price Paid Data — residential sale transactions.
 * Linked-data JSON API, no key required. Used for resale history (UNIT)
 * and price-anomaly / liquidity analysis (MARKET).
 */

export const meta: ConnectorMeta = {
  id: "land-registry-price-paid",
  name: "HM Land Registry Price Paid Data",
  dataset: "land-registry-price-paid",
  endpoint: "https://landregistry.data.gov.uk/data/ppi/transaction-record.json",
  licence: "OGL v3.0",
  requiresKey: false,
};

const rawEnvelopeSchema = z.object({
  result: z.object({
    items: z.array(z.record(z.string(), z.unknown())),
  }),
});

const rawItemSchema = z.object({
  _about: z.string().optional(),
  pricePaid: z.number(),
  transactionDate: z.string(),
  transactionId: z.string().optional(),
  newBuild: z.boolean().optional(),
  estateType: z.object({ _about: z.string().optional() }).partial().optional(),
  propertyType: z.object({ _about: z.string().optional() }).partial().optional(),
  propertyAddress: z
    .object({
      paon: z.string().optional(),
      saon: z.string().optional(),
      street: z.string().optional(),
      town: z.string().optional(),
      county: z.string().optional(),
      postcode: z.string().optional(),
    })
    .optional(),
});

export const pricePaidRecordSchema = z.object({
  recordUri: z.string(),
  pricePaid: z.number(),
  transactionDate: z.string(),
  newBuild: z.boolean().nullable(),
  estateType: z.string().nullable(),
  propertyType: z.string().nullable(),
  address: z.string(),
  postcode: z.string().nullable(),
});
export type PricePaidRecord = z.infer<typeof pricePaidRecordSchema>;

function lastSegment(uri: string | undefined): string | null {
  if (!uri) return null;
  const seg = uri.split("/").filter(Boolean).pop();
  return seg ?? null;
}

export async function searchTransactionsByPostcode(
  postcode: string,
  limit = 30,
): Promise<ConnectorResult<PricePaidRecord>> {
  const url = `${meta.endpoint}?propertyAddress.postcode=${encodeURIComponent(postcode)}&_pageSize=${limit}`;
  return runSearch(url);
}

/**
 * Transactions across a PPD district (≈ local authority, e.g.
 * "CITY OF KINGSTON UPON HULL", "ISLINGTON") — used to harvest real
 * addresses that verifiably sit inside the target authority.
 */
export async function searchTransactionsByDistrict(
  district: string,
  limit = 50,
): Promise<ConnectorResult<PricePaidRecord>> {
  const url = `${meta.endpoint}?propertyAddress.district=${encodeURIComponent(district.toUpperCase())}&_pageSize=${limit}`;
  return runSearch(url);
}

async function runSearch(url: string): Promise<ConnectorResult<PricePaidRecord>> {
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
      error: `Unexpected response shape: ${envelope.error.issues[0]?.message ?? "parse failed"}`,
    };
  }

  const records: PricePaidRecord[] = [];
  for (const item of envelope.data.result.items) {
    const parsed = rawItemSchema.safeParse(item);
    if (!parsed.success) continue; // partial rows are skipped, not fabricated
    const raw = parsed.data;
    const addr = raw.propertyAddress;
    records.push(
      pricePaidRecordSchema.parse({
        recordUri: raw._about ?? `${meta.endpoint}#${raw.transactionId ?? "unknown"}`,
        pricePaid: raw.pricePaid,
        transactionDate: raw.transactionDate,
        newBuild: raw.newBuild ?? null,
        estateType: lastSegment(raw.estateType?._about),
        propertyType: lastSegment(raw.propertyType?._about),
        address: [addr?.saon, addr?.paon, addr?.street, addr?.town].filter(Boolean).join(", "),
        postcode: addr?.postcode ?? null,
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
