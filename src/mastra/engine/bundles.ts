import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

/**
 * Reader for the phase-1 cached open-data bundles (data/properties/<id>.json).
 * These bundles are the deterministic, offline-first evidence cache for the
 * real cohort: investigator tools read them FIRST and only fall back to live
 * connector calls when no bundle exists (e.g. a property created by the
 * single-property lookup).
 */

/** Shape of one connector response inside a bundle — same as ConnectorResult. */
const bundleResultSchema = z
  .object({
    status: z.enum(["ok", "no_data", "data_gap", "error"]),
    dataset: z.string(),
    url: z.string(),
    retrievedAt: z.string(),
    licence: z.string(),
    fromCache: z.boolean(),
    records: z.array(z.unknown()).optional(),
    detail: z.string().optional(),
    reason: z.string().optional(),
    error: z.string().optional(),
  })
  .loose();
export type BundleResult = z.infer<typeof bundleResultSchema>;

const bundleSchema = z
  .object({
    property: z.unknown(),
    openData: z.record(z.string(), bundleResultSchema),
  })
  .loose();
export type PropertyBundle = z.infer<typeof bundleSchema>;

const BUNDLE_DIR = resolve(process.cwd(), "data", "properties");

export function loadPropertyBundle(propertyId: string): PropertyBundle | undefined {
  const path = resolve(BUNDLE_DIR, `${propertyId}.json`);
  if (!existsSync(path)) return undefined;
  const parsed = bundleSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  return parsed.success ? parsed.data : undefined;
}

/**
 * Trim a connector result for LLM consumption: the evidence stays verbatim
 * (dataset, urls, retrievedAt, record fields) but long record lists are
 * capped so six investigators over fifty properties stay within budget.
 */
export function trimResult(result: BundleResult, maxRecords = 12): BundleResult {
  if (!Array.isArray(result.records) || result.records.length <= maxRecords) return result;
  return {
    ...result,
    records: result.records.slice(-maxRecords),
    detail:
      `${result.records.length} records retrieved; showing the last ${maxRecords}. ` +
      (typeof result.detail === "string" ? result.detail : ""),
  };
}
