import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { getLogger } from "@/infrastructure/logging/logger";
import { fetchJson } from "@/connectors/http";
import type { ConnectorResult } from "@/connectors/types";
import * as pricePaid from "@/connectors/land-registry-price-paid";
import * as ukhpi from "@/connectors/land-registry-ukhpi";
import * as onsRents from "@/connectors/ons-rents";
import * as epc from "@/connectors/epc";
import * as planning from "@/connectors/planning";
import * as eaFlood from "@/connectors/ea-flood";
import * as policeUk from "@/connectors/police-uk";
import * as dfeSchools from "@/connectors/dfe-schools";
import * as companiesHouse from "@/connectors/companies-house";
import * as ccodOcod from "@/connectors/ccod-ocod";
import * as defraNoise from "@/connectors/defra-noise";
import * as bgsConnector from "@/connectors/bgs";

const logger = getLogger("fetch-open-data");

/**
 * Open-data fetch pipeline (spec §7, phase 1).
 *
 * Harvests ~50 REAL properties (addresses that actually transacted, from
 * HM Land Registry Price Paid Data) across deliberately risk-interesting
 * English local authorities, really queries every keyless open source for
 * each, and caches raw responses under data/properties/ + data/cache/ so
 * the demo is deterministic and replayable offline.
 *
 * REAL vs SIMULATED — the boundary, explicit:
 * - REAL: address, postcode, town/local authority, coordinates (postcode
 *   centroid via postcodes.io), tenure & property type & sale history
 *   (Land Registry), and every open-data response in `openData`.
 * - SIMULATED: the investment scenario (`value`, `intendedUse`,
 *   `capitalType`) — Nadia's organisation and its pipeline are fictional.
 *   Marked in each bundle under `_provenance`.
 */

// ---------------------------------------------------------------------------
// Target areas — chosen for risk texture, not demographics (see spec §9:
// risk is about the asset and its physical/legal/market context, never
// about the people who live there).
// ---------------------------------------------------------------------------

interface TargetArea {
  key: string;
  town: string; // PPD town value
  localAuthority: string;
  ukhpiSlug: string;
  onsRegionCode: string; // English region, for IPHRP rent index
  /** Why this area is risk-interesting (asset/context risk only). */
  riskContext: string;
  take: number; // how many real properties to keep
}

const TARGET_AREAS: TargetArea[] = [
  {
    key: "hull",
    town: "KINGSTON UPON HULL",
    localAuthority: "Kingston upon Hull",
    ukhpiSlug: "city-of-kingston-upon-hull",
    onsRegionCode: "E12000003",
    riskContext: "Coastal/estuarine city, large share of land below high-tide level (flood).",
    take: 9,
  },
  {
    key: "great-yarmouth",
    town: "GREAT YARMOUTH",
    localAuthority: "Great Yarmouth",
    ukhpiSlug: "great-yarmouth",
    onsRegionCode: "E12000006",
    riskContext: "Coastal town with tidal-flood exposure and erosion pressure.",
    take: 8,
  },
  {
    key: "middlesbrough",
    town: "MIDDLESBROUGH",
    localAuthority: "Middlesbrough",
    ukhpiSlug: "middlesbrough",
    onsRegionCode: "E12000001",
    riskContext: "Ex-industrial (steel/chemicals) legacy: contaminated-land and brownfield risk.",
    take: 8,
  },
  {
    key: "stoke",
    town: "STOKE-ON-TRENT",
    localAuthority: "Stoke-on-Trent",
    ukhpiSlug: "stoke-on-trent",
    onsRegionCode: "E12000005",
    riskContext: "Potteries legacy: former clay pits, mine workings, ground instability.",
    take: 8,
  },
  {
    key: "islington",
    town: "LONDON",
    localAuthority: "Islington",
    ukhpiSlug: "islington",
    onsRegionCode: "E12000007",
    riskContext: "London clay (shrink–swell/subsidence), dense heritage constraints.",
    take: 8,
  },
  {
    key: "brighton",
    town: "BRIGHTON",
    localAuthority: "Brighton and Hove",
    ukhpiSlug: "brighton-and-hove",
    onsRegionCode: "E12000008",
    riskContext: "High-churn coastal market: price-anomaly and liquidity signals.",
    take: 9,
  },
];

const UKHPI_MONTH = "2026-01";
// police.uk publishes with ~2 months' lag; pinned for deterministic caching.
const POLICE_MONTH = "2026-04";
const OUT_DIR = resolve(process.cwd(), "data", "properties");

// ---------------------------------------------------------------------------
// Deterministic PRNG for the SIMULATED scenario metadata.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const INTENDED_USES = [
  "Social housing acquisition",
  "Community land trust purchase",
  "Key-worker housing scheme",
  "Temporary accommodation lease",
  "Regeneration site assembly",
  "Sheltered housing scheme",
  "Affordable shared-ownership conversion",
];

function simulateScenario(id: string, lastPricePaid: number | null) {
  const rng = mulberry32(hashSeed(id));
  const base = lastPricePaid && lastPricePaid > 20_000 ? lastPricePaid : 180_000;
  const value = Math.round((base * (1.05 + rng() * 0.5)) / 1000) * 1000;
  const capitalRoll = rng();
  const capitalType = capitalRoll < 0.4 ? "public" : capitalRoll < 0.7 ? "community" : "private";
  const intendedUse = INTENDED_USES[Math.floor(rng() * INTENDED_USES.length)] ?? INTENDED_USES[0];
  return { value, capitalType, intendedUse };
}

// ---------------------------------------------------------------------------
// Geocoding (postcodes.io — ONS data, OGL v3.0). Postcode centroid: good
// enough for point-in-area open-data queries, and honestly documented.
// ---------------------------------------------------------------------------

const postcodesIoSchema = z.object({
  status: z.number(),
  result: z
    .object({
      postcode: z.string(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
      admin_district: z.string().nullable(),
    })
    .nullable(),
});

async function geocodePostcode(
  postcode: string,
): Promise<{ lat: number; lng: number; adminDistrict: string | null } | undefined> {
  const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`;
  const fetched = await fetchJson(url, { sourceId: "postcodes-io" });
  if (!fetched.ok) return undefined;
  const parsed = postcodesIoSchema.safeParse(fetched.body);
  if (!parsed.success || !parsed.data.result) return undefined;
  const { latitude, longitude, admin_district } = parsed.data.result;
  if (latitude === null || longitude === null) return undefined;
  return { lat: latitude, lng: longitude, adminDistrict: admin_district };
}

// ---------------------------------------------------------------------------
// Bundle assembly
// ---------------------------------------------------------------------------

function statusOf(result: ConnectorResult<unknown>): string {
  return result.status === "ok" ? `ok(${result.records.length})` : result.status;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const summary: Array<{ id: string; address: string; sources: Record<string, string> }> = [];

  // Per-area market context, fetched once and shared by the area's bundles.
  const areaMarket = new Map<
    string,
    { ukhpi: ConnectorResult<unknown>; rents: ConnectorResult<unknown> }
  >();

  for (const area of TARGET_AREAS) {
    logger.info("Harvesting real addresses", { area: area.key, town: area.town });
    const transactions = await pricePaid.searchTransactionsByTown(area.town, 60);
    if (transactions.status !== "ok") {
      logger.error("Could not harvest addresses — skipping area", {
        area: area.key,
        status: transactions.status,
      });
      continue;
    }

    areaMarket.set(area.key, {
      ukhpi: await ukhpi.getMonthlyIndicators(area.ukhpiSlug, UKHPI_MONTH),
      rents: await onsRents.getRentalIndex(area.onsRegionCode),
    });

    // Dedupe by address; require a postcode (needed for geocoding + EPC).
    const seen = new Set<string>();
    const candidates = transactions.records.filter((t) => {
      if (!t.postcode || !t.address || seen.has(t.address)) return false;
      seen.add(t.address);
      return true;
    });

    let kept = 0;
    for (const t of candidates) {
      if (kept >= area.take) break;
      const geo = await geocodePostcode(t.postcode ?? "");
      if (!geo) {
        logger.warn("Geocoding failed — skipping candidate", { postcode: t.postcode });
        continue;
      }
      kept += 1;
      const id = `real-${area.key}-${String(kept).padStart(3, "0")}`;
      const scenario = simulateScenario(id, t.pricePaid);

      logger.info("Querying open sources", { id, address: t.address });
      const [
        ppdHistory,
        planningEntities,
        floodAreas,
        currentFloods,
        crimes,
        noise,
        radon,
        schools,
        epcCerts,
        ccodInfo,
      ] = [
        await pricePaid.searchTransactionsByPostcode(t.postcode ?? "", 25),
        await planning.entitiesAtPoint(geo.lat, geo.lng),
        await eaFlood.floodAreasNear(geo.lat, geo.lng, 3),
        await eaFlood.currentFloodsNear(geo.lat, geo.lng, 5),
        await policeUk.streetCrimesNear(geo.lat, geo.lng, POLICE_MONTH),
        await defraNoise.noiseBandsAtPoint(geo.lat, geo.lng),
        await bgsConnector.radonPotentialAtPoint(geo.lat, geo.lng),
        await dfeSchools.schoolsInPostcodeDistrict(t.postcode ?? ""),
        await epc.searchCertificatesByPostcode(t.postcode ?? ""),
        await ccodOcod.getDatasetInfo("ocod"),
      ];
      const groundStability = bgsConnector.groundStabilityAtPoint();
      // Ownership search is only meaningful with a key; explicit gap otherwise.
      const ownership = await companiesHouse.searchCompanies(t.address);
      const market = areaMarket.get(area.key);

      const bundle = {
        _provenance: {
          real: [
            "property.address",
            "property.postcode",
            "property.localAuthority",
            "property.lat/lng (postcode centroid, postcodes.io/ONS)",
            "property.tenure",
            "property.propertyType",
            "openData.* (every connector response below)",
          ],
          simulated: ["property.value", "property.intendedUse", "property.capitalType"],
          note:
            "Real England addresses from HM Land Registry Price Paid Data, enriched with " +
            "SIMULATED investment-scenario metadata for the demo persona. Never present " +
            "the simulated fields as real commitments.",
          areaRiskContext: area.riskContext,
        },
        property: {
          id,
          uprn: null,
          address: t.address,
          postcode: t.postcode,
          localAuthority: area.localAuthority,
          lat: geo.lat,
          lng: geo.lng,
          propertyType: t.propertyType === "otherPropertyType" ? "mixed_use" : "residential",
          tenure:
            t.estateType === "freehold" || t.estateType === "leasehold" ? t.estateType : "unknown",
          value: scenario.value,
          intendedUse: scenario.intendedUse,
          capitalType: scenario.capitalType,
          status: "unscanned",
          provenance: "real_open_data",
        },
        openData: {
          landRegistryPricePaid: ppdHistory,
          planning: planningEntities,
          eaFloodAreas: floodAreas,
          eaCurrentFloods: currentFloods,
          policeUkCrime: crimes,
          defraNoise: noise,
          bgsRadon: radon,
          bgsGroundStability: groundStability,
          dfeSchools: schools,
          epc: epcCerts,
          companiesHouse: ownership,
          landRegistryCcodOcod: ccodInfo,
          ukhpi: market?.ukhpi,
          onsRents: market?.rents,
        },
      };

      writeFileSync(resolve(OUT_DIR, `${id}.json`), `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
      summary.push({
        id,
        address: `${t.address}, ${t.postcode}`,
        sources: Object.fromEntries(
          Object.entries(bundle.openData).map(([k, v]) => [
            k,
            v ? statusOf(v as ConnectorResult<unknown>) : "missing",
          ]),
        ),
      });
    }
    logger.info("Area complete", { area: area.key, kept });
  }

  const indexPath = resolve(OUT_DIR, "index.json");
  writeFileSync(
    indexPath,
    `${JSON.stringify(
      {
        generatedBy: "scripts/fetch-open-data.ts",
        note: "Raw open-data bundles for the real property cohort. See _provenance in each file.",
        count: summary.length,
        properties: summary,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  // Aggregate source health for the run log.
  const health = new Map<string, Map<string, number>>();
  for (const item of summary) {
    for (const [source, status] of Object.entries(item.sources)) {
      const bucket = health.get(source) ?? new Map<string, number>();
      bucket.set(
        status.replace(/\(\d+\)/, ""),
        (bucket.get(status.replace(/\(\d+\)/, "")) ?? 0) + 1,
      );
      health.set(source, bucket);
    }
  }
  for (const [source, buckets] of health) {
    logger.info("Source health", {
      source,
      statuses: Object.fromEntries(buckets.entries()),
    });
  }
  logger.info("Fetch complete", { properties: summary.length, out: OUT_DIR });
}

main().catch((error: unknown) => {
  logger.error("Fetch pipeline failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
