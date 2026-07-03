import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { DimensionCode, Property } from "@/db/schema";
import { getProperty } from "@/db/access/properties";
import {
  bgs,
  ccodOcod,
  companiesHouse,
  defraNoise,
  dfeSchools,
  eaFlood,
  epc,
  landRegistryPricePaid,
  landRegistryUkhpi,
  onsRents,
  planning,
  policeUk,
  type ConnectorResult,
} from "@/connectors";
import { loadPropertyBundle, trimResult, type BundleResult } from "@/mastra/engine/bundles";
import { getLogger } from "@/infrastructure/logging/logger";

const logger = getLogger("mastra:evidence-tool");

/**
 * One `gather-evidence` tool per risk dimension. Cache-first: the phase-1
 * bundle under data/properties/ answers when it exists; otherwise the live
 * connectors are called (they normalise failures — never throw).
 */

/** Bundle keys (and live fallbacks) that answer each dimension. */
const DIMENSION_SOURCES: Record<DimensionCode, readonly string[]> = {
  BUILDING: ["planning", "epc"],
  UNIT: ["defraNoise", "landRegistryPricePaid"],
  BLOCK: ["dfeSchools", "policeUkCrime"],
  PEOPLE: ["companiesHouse", "landRegistryCcodOcod"],
  LAND: ["eaFloodAreas", "eaCurrentFloods", "bgsRadon", "bgsGroundStability"],
  MARKET: ["landRegistryPricePaid", "ukhpi", "onsRents"],
};

/** UKHPI region slug + ONS region code per seeded local authority. */
const AREA_MARKET_PARAMS: Record<string, { ukhpiSlug: string; onsRegionCode: string }> = {
  "Kingston upon Hull": { ukhpiSlug: "city-of-kingston-upon-hull", onsRegionCode: "E12000003" },
  "Great Yarmouth": { ukhpiSlug: "great-yarmouth", onsRegionCode: "E12000006" },
  Middlesbrough: { ukhpiSlug: "middlesbrough", onsRegionCode: "E12000001" },
  "Stoke-on-Trent": { ukhpiSlug: "stoke-on-trent", onsRegionCode: "E12000005" },
  Islington: { ukhpiSlug: "islington", onsRegionCode: "E12000007" },
  "Brighton and Hove": { ukhpiSlug: "brighton-and-hove", onsRegionCode: "E12000008" },
};

/** Month with published police.uk data (they lag ~2 months). */
const POLICE_MONTH = "2026-04";
const UKHPI_MONTH = "2026-01";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Live connector call for one source key — used when no bundle exists. */
async function liveFetch(key: string, p: Property): Promise<ConnectorResult<unknown>> {
  switch (key) {
    case "planning":
      return planning.entitiesAtPoint(p.lat, p.lng);
    case "epc":
      return epc.searchCertificatesByPostcode(p.postcode);
    case "defraNoise":
      return defraNoise.noiseBandsAtPoint(p.lat, p.lng);
    case "landRegistryPricePaid":
      return landRegistryPricePaid.searchTransactionsByPostcode(p.postcode);
    case "dfeSchools":
      return dfeSchools.schoolsInPostcodeDistrict(p.postcode);
    case "policeUkCrime":
      return policeUk.streetCrimesNear(p.lat, p.lng, POLICE_MONTH);
    case "companiesHouse":
      return companiesHouse.searchCompanies(p.address);
    case "landRegistryCcodOcod":
      return ccodOcod.getDatasetInfo("ocod");
    case "eaFloodAreas":
      return eaFlood.floodAreasNear(p.lat, p.lng);
    case "eaCurrentFloods":
      return eaFlood.currentFloodsNear(p.lat, p.lng);
    case "bgsRadon":
      return bgs.radonPotentialAtPoint(p.lat, p.lng);
    case "bgsGroundStability":
      return Promise.resolve(bgs.groundStabilityAtPoint());
    case "ukhpi": {
      const params = AREA_MARKET_PARAMS[p.localAuthority];
      return landRegistryUkhpi.getMonthlyIndicators(
        params?.ukhpiSlug ?? slugify(p.localAuthority),
        UKHPI_MONTH,
      );
    }
    case "onsRents": {
      const params = AREA_MARKET_PARAMS[p.localAuthority];
      return onsRents.getRentalIndex(params?.onsRegionCode ?? "E12000007");
    }
    default:
      throw new Error(`Unknown evidence source key: ${key}`);
  }
}

export interface DimensionEvidence {
  property: {
    id: string;
    address: string;
    postcode: string;
    localAuthority: string;
    propertyType: string;
    tenure: string;
    value: number;
  };
  /** Source key → normalised connector result (verbatim evidence, capped lists). */
  sources: Record<string, BundleResult>;
  servedFrom: "bundle_cache" | "live_connectors";
}

/**
 * Gather every source of one dimension for one property — cache-first.
 * Shared by the Mastra tool below and by deterministic engine code.
 */
export async function gatherDimensionEvidence(
  propertyId: string,
  dimension: DimensionCode,
): Promise<DimensionEvidence> {
  const property = getProperty(propertyId);
  if (!property) throw new Error(`Property not found: ${propertyId}`);

  const keys = DIMENSION_SOURCES[dimension];
  const bundle = loadPropertyBundle(propertyId);
  const sources: Record<string, BundleResult> = {};

  if (bundle) {
    for (const key of keys) {
      const cached = bundle.openData[key];
      if (cached) sources[key] = trimResult(cached);
    }
  }
  const missing = keys.filter((key) => !(key in sources));
  if (missing.length > 0) {
    const fetched = await Promise.all(missing.map((key) => liveFetch(key, property)));
    missing.forEach((key, i) => {
      sources[key] = trimResult(fetched[i] as BundleResult);
    });
    logger.debug("Evidence fetched live", { propertyId, dimension, sources: missing });
  }

  return {
    property: {
      id: property.id,
      address: property.address,
      postcode: property.postcode,
      localAuthority: property.localAuthority,
      propertyType: property.propertyType,
      tenure: property.tenure,
      value: property.value,
    },
    sources,
    servedFrom: bundle ? "bundle_cache" : "live_connectors",
  };
}

/** Dimension-scoped `gather-evidence` Mastra tool for one investigator. */
export function makeEvidenceTool(dimension: DimensionCode) {
  return createTool({
    id: "gather-evidence",
    description:
      `Gather the ${dimension} open-data evidence for one property (cache-first, ` +
      "live UK public registers as fallback). Returns normalised connector results " +
      "with dataset ids, record ids, URLs and retrievedAt stamps to cite in sourceRefs.",
    inputSchema: z.object({
      propertyId: z.string().min(1).describe("The property id to investigate"),
    }),
    outputSchema: z.object({
      property: z.record(z.string(), z.unknown()),
      sources: z.record(z.string(), z.unknown()),
      servedFrom: z.string(),
    }),
    execute: async ({ propertyId }) => {
      const evidence = await gatherDimensionEvidence(propertyId, dimension);
      return evidence as unknown as {
        property: Record<string, unknown>;
        sources: Record<string, unknown>;
        servedFrom: string;
      };
    },
  });
}
