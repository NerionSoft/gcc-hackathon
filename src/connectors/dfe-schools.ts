import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { getLogger } from "@/infrastructure/logging/logger";
import { readCache, writeCache } from "@/connectors/cache";
import {
  dataGapResult,
  okResult,
  type ConnectorMeta,
  type ConnectorResult,
} from "@/connectors/types";

const logger = getLogger("connectors:dfe-schools");

/**
 * DfE Get Information About Schools (GIAS). There is no keyless JSON search
 * API; the DfE publishes a full daily CSV extract instead. This connector
 * downloads that extract once (60+ MB, gitignored), filters it to the
 * postcode districts we care about, and caches the small filtered subsets
 * (committed) so the demo replays offline.
 */

export const meta: ConnectorMeta = {
  id: "dfe-schools",
  name: "DfE Get Information About Schools",
  dataset: "dfe-gias-establishments",
  endpoint: "https://get-information-schools.service.gov.uk/Downloads",
  licence: "OGL v3.0",
  requiresKey: false,
};

const BULK_URL_BASE = "https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public";
const RAW_CSV_PATH = resolve(process.cwd(), "data", "cache", "dfe-schools-raw.csv");

export const schoolRecordSchema = z.object({
  urn: z.string(),
  name: z.string(),
  localAuthority: z.string(),
  postcode: z.string(),
  phase: z.string().nullable(),
  establishmentType: z.string().nullable(),
  status: z.string().nullable(),
  ofstedRating: z.string().nullable(),
  ofstedLastInspection: z.string().nullable(),
  recordUrl: z.string(),
});
export type SchoolRecord = z.infer<typeof schoolRecordSchema>;

/** Minimal CSV line parser handling quoted fields with embedded commas. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function postcodeDistrict(postcode: string): string {
  return postcode.trim().toUpperCase().split(/\s+/)[0] ?? "";
}

async function downloadBulkExtract(): Promise<string | undefined> {
  // The daily extract is stamped with the publication date; try today then
  // step back a few days.
  for (let daysBack = 0; daysBack <= 6; daysBack += 1) {
    const date = new Date(Date.now() - daysBack * 86_400_000);
    const stamp = date.toISOString().slice(0, 10).replaceAll("-", "");
    const url = `${BULK_URL_BASE}/edubasealldata${stamp}.csv`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(300_000) });
      if (!response.ok) continue;
      const text = await response.text();
      if (text.length < 1_000_000) continue; // sanity: real extract is tens of MB
      mkdirSync(dirname(RAW_CSV_PATH), { recursive: true });
      writeFileSync(RAW_CSV_PATH, text, "utf8");
      logger.info("Downloaded GIAS bulk extract", { url, bytes: text.length });
      return url;
    } catch (error) {
      logger.warn("GIAS bulk download attempt failed", {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return undefined;
}

let extractByDistrict: Map<string, SchoolRecord[]> | undefined;

function indexExtract(csv: string): Map<string, SchoolRecord[]> {
  const lines = csv.split(/\r?\n/);
  const header = parseCsvLine(lines[0] ?? "");
  const col = (name: string) => header.indexOf(name);
  const idx = {
    urn: col("URN"),
    name: col("EstablishmentName"),
    la: col("LA (name)"),
    postcode: col("Postcode"),
    phase: col("PhaseOfEducation (name)"),
    type: col("TypeOfEstablishment (name)"),
    status: col("EstablishmentStatus (name)"),
    ofstedRating: col("OfstedRating (name)"),
    ofstedLastInsp: col("OfstedLastInsp"),
  };
  const map = new Map<string, SchoolRecord[]>();
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const fields = parseCsvLine(line);
    const urn = fields[idx.urn];
    const postcode = fields[idx.postcode];
    if (!urn || !postcode) continue;
    const district = postcodeDistrict(postcode);
    const record: SchoolRecord = {
      urn,
      name: fields[idx.name] ?? "",
      localAuthority: fields[idx.la] ?? "",
      postcode,
      phase: fields[idx.phase] || null,
      establishmentType: fields[idx.type] || null,
      status: fields[idx.status] || null,
      ofstedRating: idx.ofstedRating >= 0 ? fields[idx.ofstedRating] || null : null,
      ofstedLastInspection: idx.ofstedLastInsp >= 0 ? fields[idx.ofstedLastInsp] || null : null,
      recordUrl: `https://get-information-schools.service.gov.uk/Establishments/Establishment/Details/${urn}`,
    };
    if (!record.name) continue;
    const bucket = map.get(district);
    if (bucket) bucket.push(record);
    else map.set(district, [record]);
  }
  return map;
}

/**
 * Schools in the same postcode district (e.g. "HU9"), open establishments
 * first. Serves the committed filtered cache when offline.
 */
export async function schoolsInPostcodeDistrict(
  postcode: string,
): Promise<ConnectorResult<SchoolRecord>> {
  const district = postcodeDistrict(postcode);
  const cacheKey = `district:${district}`;

  const cached = readCache(meta.id, cacheKey);
  if (cached) {
    const records = z.array(schoolRecordSchema).parse(cached.body);
    return okResult(
      { dataset: meta.dataset, url: cached.url, licence: meta.licence, fromCache: true },
      records,
    );
  }

  if (!extractByDistrict) {
    let sourceUrl = `${BULK_URL_BASE}/edubasealldata.csv`;
    if (!existsSync(RAW_CSV_PATH)) {
      const downloadedFrom = await downloadBulkExtract();
      if (!downloadedFrom) {
        return dataGapResult(
          meta,
          "no_open_endpoint",
          "GIAS has no keyless search API and the bulk CSV extract could not be downloaded; school findings are unavailable for uncached districts.",
        );
      }
      sourceUrl = downloadedFrom;
    }
    extractByDistrict = indexExtract(readFileSync(RAW_CSV_PATH, "utf8"));
    logger.info("Indexed GIAS extract", {
      districts: extractByDistrict.size,
      source: sourceUrl,
    });
  }

  const records = (extractByDistrict.get(district) ?? [])
    .filter((s) => s.status?.toLowerCase().includes("open") ?? true)
    .slice(0, 50);

  writeCache(
    meta.id,
    cacheKey,
    `${BULK_URL_BASE}/edubasealldata.csv#district=${district}`,
    records,
  );

  return okResult(
    {
      dataset: meta.dataset,
      url: `${BULK_URL_BASE}/edubasealldata.csv#district=${district}`,
      licence: meta.licence,
      fromCache: false,
    },
    records,
  );
}
