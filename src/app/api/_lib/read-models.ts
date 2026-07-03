import { getDb } from "@/db/client";
import { getAdjudication } from "@/db/access/adjudications";
import { getProperty } from "@/db/access/properties";
import { listSignalsForProperty } from "@/db/access/signals";
import { listClusters } from "@/db/access/clusters";
import { severitySchema, type Severity } from "@/db/schema";
import type {
  ClusterCard,
  DossierResponse,
  PortfolioSummary,
  PortfolioTile,
  SearchResult,
} from "@/presentation/data/contracts";
import {
  clusterCardSchema,
  dossierResponseSchema,
  portfolioSummarySchema,
  portfolioTileSchema,
  searchResultSchema,
} from "@/presentation/data/contracts";

/**
 * Read models for the thin phase-4 API. Aggregation SQL lives here (not in
 * `src/db/access/`) deliberately: the engine worker owns that directory in a
 * parallel branch, and these queries are UI-serving conveniences the engine's
 * richer endpoints will supersede.
 */

const SEVERITY_RANK: Record<Severity, number> = { green: 1, amber: 2, red: 3 };

interface TileAggRow {
  id: string;
  address: string;
  postcode: string;
  local_authority: string;
  property_type: string;
  capital_type: string;
  value: number;
  status: string;
  provenance: string;
  signal_count: number | null;
  red_count: number | null;
  amber_count: number | null;
  worst_rank: number | null;
}

const RANK_TO_SEVERITY: Record<number, Severity> = { 1: "green", 2: "amber", 3: "red" };

export function getPortfolioTiles(): PortfolioTile[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT p.id, p.address, p.postcode, p.local_authority, p.property_type,
              p.capital_type, p.value, p.status, p.provenance,
              s.signal_count, s.red_count, s.amber_count, s.worst_rank
       FROM properties p
       LEFT JOIN (
         SELECT property_id,
                COUNT(*) AS signal_count,
                SUM(severity = 'red') AS red_count,
                SUM(severity = 'amber') AS amber_count,
                MAX(CASE severity WHEN 'red' THEN 3 WHEN 'amber' THEN 2 ELSE 1 END) AS worst_rank
         FROM risk_signals
         GROUP BY property_id
       ) s ON s.property_id = p.id
       -- Deterministic scatter: keyed on the id's trailing digits so the 50
       -- real properties interleave with the synthetic mass instead of
       -- stacking in the wall's first rows (better idle wall, better F2 shot).
       ORDER BY substr(p.id, -2), p.id`,
    )
    .all() as TileAggRow[];

  const adverseDims = db
    .prepare(
      `SELECT DISTINCT property_id, dimension_code
       FROM risk_signals WHERE severity IN ('amber', 'red')`,
    )
    .all() as Array<{ property_id: string; dimension_code: string }>;
  const dimsByProperty = new Map<string, string[]>();
  for (const row of adverseDims) {
    const dims = dimsByProperty.get(row.property_id) ?? [];
    dims.push(row.dimension_code);
    dimsByProperty.set(row.property_id, dims);
  }

  return rows.map((row) =>
    portfolioTileSchema.parse({
      id: row.id,
      address: row.address,
      postcode: row.postcode,
      localAuthority: row.local_authority,
      propertyType: row.property_type,
      capitalType: row.capital_type,
      value: row.value,
      status: row.status,
      provenance: row.provenance,
      dominantSeverity: row.worst_rank ? RANK_TO_SEVERITY[row.worst_rank] : null,
      signalCount: row.signal_count ?? 0,
      redCount: row.red_count ?? 0,
      amberCount: row.amber_count ?? 0,
      adverseDimensions: (dimsByProperty.get(row.id) ?? []).sort(),
    }),
  );
}

export function getPortfolioSummary(): PortfolioSummary {
  const db = getDb();
  const statusRows = db
    .prepare("SELECT status, COUNT(*) AS n FROM properties GROUP BY status")
    .all() as Array<{ status: string; n: number }>;
  const capital = db.prepare("SELECT COALESCE(SUM(value), 0) AS v FROM properties").get() as {
    v: number;
  };
  const signalCount = db.prepare("SELECT COUNT(*) AS n FROM risk_signals").get() as { n: number };
  const freshness = db.prepare("SELECT MAX(source_retrieved_at) AS m FROM risk_signals").get() as {
    m: string | null;
  };
  const framework = db
    .prepare("SELECT name, version FROM risk_frameworks ORDER BY effective_date DESC LIMIT 1")
    .get() as { name: string; version: string } | undefined;
  const dimensionCount = db.prepare("SELECT COUNT(*) AS n FROM risk_dimensions").get() as {
    n: number;
  };
  const authorities = db
    .prepare("SELECT DISTINCT local_authority AS la FROM properties ORDER BY la")
    .all() as Array<{ la: string }>;

  return portfolioSummarySchema.parse({
    totalProperties: statusRows.reduce((sum, r) => sum + r.n, 0),
    statusCounts: Object.fromEntries(statusRows.map((r) => [r.status, r.n])),
    capitalUnderReview: capital.v,
    signalCount: signalCount.n,
    framework: {
      name: framework?.name ?? "Civic Property Risk v1",
      version: framework?.version ?? "1.0.0",
      dimensionCount: dimensionCount.n,
    },
    sourcesRefreshedAt: freshness.m,
    localAuthorities: authorities.map((r) => r.la),
  });
}

// ============================================
// Clusters — persisted if the engine has run, deterministic preview otherwise
// ============================================

interface AdverseSignalRow {
  property_id: string;
  signal_code: string;
  dimension_code: string;
  severity: string;
}

/** How many cluster cards the preview condenses into (SPEC F2: 9 cards). */
const PREVIEW_CLUSTER_COUNT = 9;

export function getClusterCards(): { preview: boolean; clusters: ClusterCard[] } {
  const persisted = listClusters();
  if (persisted.length > 0) {
    const tiles = getPortfolioTiles();
    const severityByProperty = new Map(tiles.map((t) => [t.id, t.dominantSeverity]));
    return {
      preview: false,
      clusters: persisted.map((c) =>
        clusterCardSchema.parse({
          id: c.id,
          name: c.name,
          description: c.description,
          pattern: c.pattern,
          groupingRationale: c.groupingRationale,
          propertyIds: c.propertyIds,
          propertyCount: c.propertyIds.length,
          dominantSeverity: worstOf(
            c.propertyIds
              .map((id) => severityByProperty.get(id) ?? null)
              .filter((s): s is Severity => s !== null),
          ),
          status: c.status,
        }),
      ),
    };
  }
  return { preview: true, clusters: derivePreviewClusters() };
}

function worstOf(severities: Severity[]): Severity | null {
  let worst: Severity | null = null;
  for (const s of severities) {
    if (worst === null || SEVERITY_RANK[s] > SEVERITY_RANK[worst]) worst = s;
  }
  return worst;
}

/**
 * Deterministic preview clustering over stored signals, standing in until the
 * engine worker's `clusterByRiskPattern` persists real clusters. Signature =
 * the worst adverse signal per dimension, ranked by severity, top two — e.g.
 * "LAND-FLOOD:red + BUILDING-ENERGY:amber". All-green properties form the
 * "no adverse signals" card; long-tail signatures fold into one remainder
 * card so the wall always condenses into exactly 9 cards.
 */
function derivePreviewClusters(): ClusterCard[] {
  const db = getDb();
  const titles = new Map(
    (
      db.prepare("SELECT code, title FROM risk_signal_definitions").all() as Array<{
        code: string;
        title: string;
      }>
    ).map((r) => [r.code, r.title]),
  );

  const scanned = db.prepare("SELECT DISTINCT property_id AS id FROM risk_signals").all() as Array<{
    id: string;
  }>;
  const adverse = db
    .prepare(
      `SELECT property_id, signal_code, dimension_code, severity
       FROM risk_signals WHERE severity IN ('amber', 'red')`,
    )
    .all() as AdverseSignalRow[];

  const adverseByProperty = new Map<string, AdverseSignalRow[]>();
  for (const row of adverse) {
    const list = adverseByProperty.get(row.property_id) ?? [];
    list.push(row);
    adverseByProperty.set(row.property_id, list);
  }

  const groups = new Map<string, string[]>();
  for (const { id } of scanned) {
    const rows = adverseByProperty.get(id) ?? [];
    const signature = signatureOf(rows);
    const members = groups.get(signature) ?? [];
    members.push(id);
    groups.set(signature, members);
  }

  const clear = groups.get("CLEAR") ?? [];
  groups.delete("CLEAR");
  const ranked = [...groups.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );
  const head = ranked.slice(0, PREVIEW_CLUSTER_COUNT - 2);
  const tail = ranked.slice(PREVIEW_CLUSTER_COUNT - 2);

  const cards: ClusterCard[] = [];
  for (const [signature, memberIds] of head) {
    cards.push(previewCard(signature, memberIds, titles));
  }
  if (tail.length > 0) {
    const memberIds = tail.flatMap(([, ids]) => ids);
    const worst = tail.some(([sig]) => sig.includes(":red")) ? "red" : "amber";
    cards.push(
      clusterCardSchema.parse({
        id: "preview-mixed-patterns",
        name: "Mixed adverse patterns",
        description: `${tail.length} low-frequency risk signatures combined.`,
        pattern: tail.map(([sig]) => sig).join(" | "),
        groupingRationale:
          "Long-tail signatures with too few members to stand alone are held together pending engine clustering.",
        propertyIds: memberIds.sort(),
        propertyCount: memberIds.length,
        dominantSeverity: severitySchema.parse(worst),
        status: "preview",
      }),
    );
  }
  cards.push(
    clusterCardSchema.parse({
      id: "preview-clear",
      name: "No adverse signals",
      description: "Every extracted signal on these properties is green.",
      pattern: "ALL:green",
      groupingRationale:
        "All stored findings sit at green severity; no dimension raised an amber or red flag.",
      propertyIds: clear.sort(),
      propertyCount: clear.length,
      dominantSeverity: clear.length > 0 ? "green" : null,
      status: "preview",
    }),
  );
  return cards;
}

function signatureOf(rows: AdverseSignalRow[]): string {
  if (rows.length === 0) return "CLEAR";
  const rank: Record<string, number> = { red: 3, amber: 2 };
  const worstPerDimension = new Map<string, AdverseSignalRow>();
  for (const row of rows) {
    const current = worstPerDimension.get(row.dimension_code);
    if (!current || (rank[row.severity] ?? 0) > (rank[current.severity] ?? 0)) {
      worstPerDimension.set(row.dimension_code, row);
    }
  }
  return [...worstPerDimension.values()]
    .sort(
      (a, b) =>
        (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0) ||
        a.signal_code.localeCompare(b.signal_code),
    )
    .slice(0, 2)
    .map((row) => `${row.signal_code}:${row.severity}`)
    .join(" + ");
}

function previewCard(
  signature: string,
  memberIds: string[],
  titles: Map<string, string>,
): ClusterCard {
  const parts = signature.split(" + ").map((part) => {
    const [code, severity] = part.split(":");
    return { code, severity: severitySchema.parse(severity), title: titles.get(code) ?? code };
  });
  const worst = worstOf(parts.map((p) => p.severity));
  const name =
    parts.length === 1
      ? `${parts[0].title} — ${parts[0].severity}`
      : parts.map((p) => p.title).join(" + ");
  return clusterCardSchema.parse({
    id: `preview-${signature.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    description: parts.map((p) => `${p.title} at ${p.severity} severity (${p.code})`).join("; "),
    pattern: signature,
    groupingRationale: `These properties share the same worst-signal signature: ${signature}. Grouping is deterministic (signature match), not model-driven.`,
    propertyIds: memberIds.sort(),
    propertyCount: memberIds.length,
    dominantSeverity: worst,
    status: "preview",
  });
}

// ============================================
// Dossier (F0)
// ============================================

export function getDossier(propertyId: string): DossierResponse | undefined {
  const property = getProperty(propertyId);
  if (!property) return undefined;
  const signals = listSignalsForProperty(propertyId);
  const db = getDb();
  const adjRow = db
    .prepare("SELECT id FROM adjudications WHERE property_id = ? ORDER BY last_activity_at DESC")
    .get(propertyId) as { id: string } | undefined;
  // Adjudications arrive with the engine (phases 2-3); when present, surface the latest.
  const adjudication = adjRow ? (getAdjudication(adjRow.id) ?? null) : null;
  return dossierResponseSchema.parse({ property, signals, adjudication });
}

// ============================================
// Search (F0 resolver)
// ============================================

interface SearchRow {
  id: string;
  address: string;
  postcode: string;
  local_authority: string;
  uprn: string | null;
  status: string;
  provenance: string;
}

/**
 * Fuzzy resolution of address / UPRN / title number / postcode / listing URL
 * against the seeded portfolio. A listing URL is only used to salvage
 * address-ish tokens (SPEC F0: the listing only resolves the address).
 */
export function searchProperties(rawQuery: string, limit = 8): SearchResult[] {
  const query = normaliseQuery(rawQuery);
  if (query.length < 2) return [];
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, address, postcode, local_authority, uprn, status, provenance
       FROM properties`,
    )
    .all() as SearchRow[];

  const tokens = query.split(/\s+/).filter((t) => t.length >= 2);
  const scored = rows
    .map((row) => ({ row, score: scoreRow(row, query, tokens) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id))
    .slice(0, limit);

  return scored.map(({ row }) =>
    searchResultSchema.parse({
      id: row.id,
      address: row.address,
      postcode: row.postcode,
      localAuthority: row.local_authority,
      uprn: row.uprn,
      status: row.status,
      provenance: row.provenance,
    }),
  );
}

function normaliseQuery(raw: string): string {
  let q = raw.trim().toLowerCase();
  // Listing URL → keep slug words (street names survive, ids and domains go).
  if (/^https?:\/\//.test(q)) {
    try {
      const url = new URL(q);
      q = decodeURIComponent(url.pathname + " " + url.search)
        .replace(/[/\-_+=?&.]/g, " ")
        .replace(/\b\d{5,}\b/g, " ");
    } catch {
      // fall through with the raw string
    }
  }
  return q.replace(/,/g, " ").replace(/\s+/g, " ").trim();
}

function scoreRow(row: SearchRow, query: string, tokens: string[]): number {
  const address = row.address.toLowerCase();
  const postcode = row.postcode.toLowerCase();
  const authority = row.local_authority.toLowerCase();
  const compactQuery = query.replace(/\s/g, "");

  // Exact identifiers first: UPRN, property id (stands in for title number), postcode.
  if (row.uprn && compactQuery === row.uprn.toLowerCase()) return 1000;
  if (compactQuery === row.id.toLowerCase()) return 1000;
  if (compactQuery === postcode.replace(/\s/g, "")) return 900;
  if (address === query) return 900;

  let score = 0;
  if (postcode.startsWith(query) || compactQuery.startsWith(postcode.replace(/\s/g, "")))
    score += 300;
  if (address.includes(query)) score += 250;
  for (const token of tokens) {
    if (address.includes(token)) score += 40;
    else if (authority.includes(token)) score += 10;
    else if (postcode.replace(/\s/g, "").includes(token.replace(/\s/g, ""))) score += 25;
  }
  return score;
}
