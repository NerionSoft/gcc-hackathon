import "dotenv/config";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { getLogger } from "@/infrastructure/logging/logger";
import { env } from "@/infrastructure/config/env";
import { getDb } from "@/db/client";
import { appendAuditEvent } from "@/db/access/audit";
import { insertFramework } from "@/db/access/frameworks";
import { countProperties, insertProperties } from "@/db/access/properties";
import { countSignals, insertRiskSignal } from "@/db/access/signals";
import { insertEvidenceUpdate } from "@/db/access/evidence";
import { propertySchema, type Property } from "@/db/schema";
import { CIVIC_PROPERTY_RISK_V1 } from "./seed-data/framework";
import { EVIDENCE_UPDATES } from "./seed-data/evidence-updates";

const logger = getLogger("seed");

/**
 * Seed pipeline (spec §7): rebuilds data/cpi.db from scratch through the
 * access layer, so every hard invariant (sourced signals, append-only audit)
 * applies to seed data too.
 *
 * Portfolio composition:
 * - ~50 REAL properties from data/properties/ (cached open-data bundles,
 *   provenance "real_open_data") — these go through the real investigator
 *   agents during the demo.
 * - ~2,750 SYNTHETIC properties (fictional addresses, provenance
 *   "synthetic") with pre-computed, plausible signal distributions for
 *   portfolio scale.
 *
 * FAIRNESS (spec §9, hard rule): synthetic distributions are driven ONLY by
 * asset/context characteristics (coastal exposure, industrial legacy,
 * building-stock age, market liquidity). NO distribution below encodes —
 * or proxies — any demographic or protected characteristic.
 */

// ---------------------------------------------------------------------------
// Deterministic PRNG — same seed, same portfolio, reproducible demo.
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

const rng = mulberry32(0xc1b1c5);

function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error("pick() from empty list");
  return item;
}

function randBetween(min: number, max: number): number {
  return min + rng() * (max - min);
}

// ---------------------------------------------------------------------------
// Synthetic areas — matching the real cohort's local authorities.
// Risk texture is about the LAND/MARKET context, never about residents.
// ---------------------------------------------------------------------------

interface SyntheticArea {
  key: string;
  localAuthority: string;
  districts: string[];
  centre: { lat: number; lng: number };
  valueBand: { min: number; max: number };
  /** Probability of flood exposure — coastal/estuarine asset context. */
  floodRate: number;
  /** Probability of poor energy performance — building-stock age profile. */
  epcFgRate: number;
  /** Probability of opaque corporate ownership. */
  ownershipOpacityRate: number;
  count: number;
}

const SYNTHETIC_AREAS: SyntheticArea[] = [
  {
    key: "hull",
    localAuthority: "Kingston upon Hull",
    districts: ["HU3", "HU5", "HU7", "HU9"],
    centre: { lat: 53.755, lng: -0.335 },
    valueBand: { min: 85_000, max: 185_000 },
    floodRate: 0.32,
    epcFgRate: 0.17,
    ownershipOpacityRate: 0.08,
    count: 550,
  },
  {
    key: "great-yarmouth",
    localAuthority: "Great Yarmouth",
    districts: ["NR29", "NR30", "NR31"],
    centre: { lat: 52.608, lng: 1.727 },
    valueBand: { min: 110_000, max: 230_000 },
    floodRate: 0.34,
    epcFgRate: 0.18,
    ownershipOpacityRate: 0.09,
    count: 400,
  },
  {
    key: "middlesbrough",
    localAuthority: "Middlesbrough",
    districts: ["TS1", "TS3", "TS4", "TS5"],
    centre: { lat: 54.574, lng: -1.235 },
    valueBand: { min: 75_000, max: 165_000 },
    floodRate: 0.08,
    epcFgRate: 0.19,
    ownershipOpacityRate: 0.1,
    count: 450,
  },
  {
    key: "stoke",
    localAuthority: "Stoke-on-Trent",
    districts: ["ST1", "ST4", "ST6"],
    centre: { lat: 53.008, lng: -2.185 },
    valueBand: { min: 85_000, max: 175_000 },
    floodRate: 0.06,
    epcFgRate: 0.2,
    ownershipOpacityRate: 0.08,
    count: 450,
  },
  {
    key: "islington",
    localAuthority: "Islington",
    districts: ["N1", "N5", "N7", "N19"],
    centre: { lat: 51.547, lng: -0.105 },
    valueBand: { min: 450_000, max: 1_250_000 },
    floodRate: 0.05,
    epcFgRate: 0.1,
    ownershipOpacityRate: 0.16,
    count: 400,
  },
  {
    key: "brighton",
    localAuthority: "Brighton and Hove",
    districts: ["BN1", "BN2", "BN3"],
    centre: { lat: 50.831, lng: -0.145 },
    valueBand: { min: 280_000, max: 660_000 },
    floodRate: 0.12,
    epcFgRate: 0.12,
    ownershipOpacityRate: 0.12,
    count: 500,
  },
];

const STREET_NAMES = [
  "Foundry Walk",
  "Mariners Reach",
  "Kiln Court",
  "Dockside Terrace",
  "Cooperage Lane",
  "Signal House Row",
  "Harbour View",
  "Chandlers Way",
  "Beacon Rise",
  "Old Wharf Street",
  "Potters Field",
  "Ropery Close",
  "Saltings Avenue",
  "Ironmasters Way",
  "Quayside Gardens",
  "Tidemill Street",
  "Colliery Row",
  "Weavers Yard",
  "Lighthouse Approach",
  "Granary Square",
];

const INTENDED_USES = [
  "Social housing acquisition",
  "Community land trust purchase",
  "Key-worker housing scheme",
  "Temporary accommodation lease",
  "Regeneration site assembly",
  "Sheltered housing scheme",
  "Affordable shared-ownership conversion",
];

const SEED_TIME = new Date().toISOString();

function syntheticProperty(area: SyntheticArea, n: number): Property {
  const id = `synth-${area.key}-${String(n).padStart(4, "0")}`;
  const district = pick(area.districts);
  const streetNo = 1 + Math.floor(rng() * 120);
  const street = pick(STREET_NAMES);
  const letters = "ABDEFGHJLNPQRSTUWXYZ";
  const postcode = `${district} 9${letters[Math.floor(rng() * letters.length)]}${letters[Math.floor(rng() * letters.length)]}`;
  const typeRoll = rng();
  const tenureRoll = rng();
  const capitalRoll = rng();
  return propertySchema.parse({
    id,
    uprn: null,
    // Fictional address: invented street names + sector-9 postcodes.
    address: `${streetNo} ${street}, ${area.localAuthority}`,
    postcode,
    localAuthority: area.localAuthority,
    lat: area.centre.lat + randBetween(-0.03, 0.03),
    lng: area.centre.lng + randBetween(-0.045, 0.045),
    propertyType:
      typeRoll < 0.85
        ? "residential"
        : typeRoll < 0.93
          ? "mixed_use"
          : typeRoll < 0.98
            ? "commercial"
            : "land",
    tenure: tenureRoll < 0.68 ? "freehold" : tenureRoll < 0.94 ? "leasehold" : "unknown",
    value: Math.round(randBetween(area.valueBand.min, area.valueBand.max) / 1000) * 1000,
    intendedUse: pick(INTENDED_USES),
    capitalType: capitalRoll < 0.4 ? "public" : capitalRoll < 0.7 ? "community" : "private",
    status: "unscanned",
    provenance: "synthetic",
  });
}

/**
 * Pre-computed signals for a synthetic property. recordIds are prefixed
 * "synthetic:" and URLs point at the real dataset landing pages — the
 * real/simulated boundary stays visible all the way into the database.
 */
function syntheticSignals(property: Property, area: SyntheticArea): unknown[] {
  const signals: unknown[] = [];
  const mk = (
    signalCode: string,
    dimensionCode: string,
    severity: "green" | "amber" | "red",
    finding: string,
    rationale: string,
    dataset: string,
    url: string,
    confidence: number,
  ) => ({
    id: `${property.id}-${signalCode.toLowerCase()}`,
    propertyId: property.id,
    signalCode,
    dimensionCode,
    finding,
    sourceRef: {
      dataset,
      recordId: `synthetic:${property.id}:${signalCode}`,
      url,
      retrievedAt: SEED_TIME,
    },
    severity,
    confidence,
    rationale,
  });

  // LAND-FLOOD — coastal/estuarine context only.
  if (rng() < area.floodRate) {
    const red = rng() < 0.35;
    signals.push(
      mk(
        "LAND-FLOOD",
        "LAND",
        red ? "red" : "amber",
        red
          ? "Property falls within an Environment Agency flood warning area with recent activations."
          : "Property lies inside an Environment Agency flood alert area.",
        red
          ? "Pre-computed synthetic finding: warning-area membership plus recent activation history meets the red threshold of the severity rubric."
          : "Pre-computed synthetic finding: alert-area membership without recent activations meets the amber threshold.",
        "ea-flood-monitoring",
        "https://environment.data.gov.uk/flood-monitoring/doc/reference",
        0.85,
      ),
    );
  } else {
    signals.push(
      mk(
        "LAND-FLOOD",
        "LAND",
        "green",
        "No Environment Agency flood alert or warning area covers this location.",
        "Pre-computed synthetic finding: no flood-area membership within 3 km.",
        "ea-flood-monitoring",
        "https://environment.data.gov.uk/flood-monitoring/doc/reference",
        0.8,
      ),
    );
  }

  // BUILDING-ENERGY — building-stock age profile.
  if (rng() < area.epcFgRate) {
    const isG = rng() < 0.3;
    signals.push(
      mk(
        "BUILDING-ENERGY",
        "BUILDING",
        isG ? "red" : "amber",
        `Most recent Energy Performance Certificate rates the property ${isG ? "G" : "F"}.`,
        "Pre-computed synthetic finding: EPC band F/G breaches the minimum energy efficiency standard for lettings and signals costly retrofit liability.",
        "epc-domestic",
        "https://epc.opendatacommunities.org/",
        0.9,
      ),
    );
  }

  // PEOPLE-OWNER — corporate opacity, never personal characteristics.
  if (rng() < area.ownershipOpacityRate) {
    const offshore = rng() < 0.3;
    signals.push(
      mk(
        "PEOPLE-OWNER",
        "PEOPLE",
        offshore ? "red" : "amber",
        offshore
          ? "Registered proprietor is an overseas company appearing in the Land Registry OCOD dataset."
          : "Registered proprietor is a corporate vehicle whose control chain could not be resolved from public filings.",
        offshore
          ? "Pre-computed synthetic finding: overseas registration plus unresolved beneficial control meets the red threshold."
          : "Pre-computed synthetic finding: unresolved control chain in Companies House filings meets the amber threshold.",
        "land-registry-ccod-ocod",
        "https://use-land-property-data.service.gov.uk/datasets/ocod",
        0.75,
      ),
    );
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const dbPath = resolve(process.cwd(), env.SQLITE_PATH);
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const p = `${dbPath}${suffix}`;
    if (existsSync(p)) rmSync(p);
  }
  const db = getDb();
  logger.info("Rebuilding database", { path: dbPath });

  // 1. Referential: Civic Property Risk v1.
  const framework = insertFramework(CIVIC_PROPERTY_RISK_V1, db);
  appendAuditEvent(
    {
      actor: "agent",
      action: "framework_seeded",
      entityType: "RiskFramework",
      entityId: framework.id,
      rationale: `Seeded "${framework.name}" v${framework.version}: ${framework.dimensions.length} dimensions, ${framework.dimensions.reduce((n, d) => n + d.signals.length, 0)} signal definitions.`,
    },
    db,
  );

  // 2. Real cohort from cached open-data bundles.
  const propertiesDir = resolve(process.cwd(), "data", "properties");
  const realProperties: Property[] = [];
  if (existsSync(propertiesDir)) {
    for (const file of readdirSync(propertiesDir).sort()) {
      if (!file.endsWith(".json") || file === "index.json") continue;
      const bundle = JSON.parse(readFileSync(resolve(propertiesDir, file), "utf8")) as {
        property?: unknown;
      };
      const parsed = propertySchema.safeParse(bundle.property);
      if (!parsed.success) {
        logger.warn("Skipping malformed cached property bundle", { file });
        continue;
      }
      realProperties.push(parsed.data);
    }
  }
  if (realProperties.length === 0) {
    logger.warn(
      "No cached real properties found — run `pnpm fetch-data` first for the full demo portfolio.",
    );
  }
  insertProperties(realProperties, db);
  appendAuditEvent(
    {
      actor: "agent",
      action: "real_portfolio_seeded",
      entityType: "Property",
      entityId: "portfolio",
      rationale: `Loaded ${realProperties.length} real properties from cached open-data bundles (data/properties/). Scenario metadata (value, intendedUse, capitalType) is simulated — see README.`,
    },
    db,
  );

  // 3. Synthetic scale cohort with pre-computed signals.
  let syntheticCount = 0;
  let signalCount = 0;
  for (const area of SYNTHETIC_AREAS) {
    const batch: Property[] = [];
    for (let n = 1; n <= area.count; n += 1) {
      batch.push(syntheticProperty(area, n));
    }
    insertProperties(batch, db);
    syntheticCount += batch.length;
    for (const property of batch) {
      for (const signal of syntheticSignals(property, area)) {
        const result = insertRiskSignal(signal, db);
        if (result.ok) signalCount += 1;
        else throw new Error(`Seed produced an invalid signal: ${result.issues.join("; ")}`);
      }
    }
  }
  appendAuditEvent(
    {
      actor: "agent",
      action: "synthetic_portfolio_seeded",
      entityType: "Property",
      entityId: "portfolio",
      rationale:
        `Generated ${syntheticCount} synthetic properties with ${signalCount} pre-computed signals. ` +
        "Distributions reflect asset context only (coastal flood exposure, building-stock age, corporate ownership opacity); no demographic or protected-characteristic proxies.",
    },
    db,
  );

  // 4. Pre-written evidence-feed updates for the simulator.
  for (const update of EVIDENCE_UPDATES) {
    insertEvidenceUpdate(update, db);
  }
  appendAuditEvent(
    {
      actor: "agent",
      action: "evidence_feed_seeded",
      entityType: "EvidenceUpdate",
      entityId: "feed",
      rationale: `Seeded ${EVIDENCE_UPDATES.length} pre-written evidence-feed updates (deterministic demo replay; ~60% corroborating, ~25% new minor, ~15% material adverse).`,
    },
    db,
  );

  const totals = {
    properties: countProperties(db),
    real: realProperties.length,
    synthetic: syntheticCount,
    signals: countSignals(db),
    evidenceUpdates: EVIDENCE_UPDATES.length,
  };
  logger.info("Seed complete", totals);
}

try {
  main();
} catch (error) {
  logger.error("Seed failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
}
