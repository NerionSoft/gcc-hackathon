import type Database from "better-sqlite3";
import { getDb } from "@/db/client";
import { riskClusterSchema, type RiskCluster } from "@/db/schema";

interface ClusterRow {
  id: string;
  name: string;
  description: string;
  property_ids: string;
  pattern: string;
  grouping_rationale: string;
  proposed_assessment: string | null;
  proposed_disclosure: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

function rowToCluster(row: ClusterRow): RiskCluster {
  return riskClusterSchema.parse({
    id: row.id,
    name: row.name,
    description: row.description,
    propertyIds: JSON.parse(row.property_ids),
    pattern: row.pattern,
    groupingRationale: row.grouping_rationale,
    proposedAssessment: row.proposed_assessment,
    proposedDisclosure: row.proposed_disclosure,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
  });
}

/**
 * Insert or replace a cluster. The schema refinement rejects any cluster in
 * an approved/published/completed state whose reviewedAt is still null —
 * nothing gets published without a named human review (spec §3, F3).
 */
export function upsertCluster(candidate: unknown, db: Database.Database = getDb()): RiskCluster {
  const c = riskClusterSchema.parse(candidate);
  db.prepare(
    `INSERT INTO risk_clusters (
       id, name, description, property_ids, pattern, grouping_rationale,
       proposed_assessment, proposed_disclosure, status, reviewed_by, reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       description = excluded.description,
       property_ids = excluded.property_ids,
       pattern = excluded.pattern,
       grouping_rationale = excluded.grouping_rationale,
       proposed_assessment = excluded.proposed_assessment,
       proposed_disclosure = excluded.proposed_disclosure,
       status = excluded.status,
       reviewed_by = excluded.reviewed_by,
       reviewed_at = excluded.reviewed_at`,
  ).run(
    c.id,
    c.name,
    c.description,
    JSON.stringify(c.propertyIds),
    c.pattern,
    c.groupingRationale,
    c.proposedAssessment,
    c.proposedDisclosure,
    c.status,
    c.reviewedBy,
    c.reviewedAt,
  );
  return c;
}

export function getCluster(id: string, db: Database.Database = getDb()): RiskCluster | undefined {
  const row = db.prepare("SELECT * FROM risk_clusters WHERE id = ?").get(id) as
    | ClusterRow
    | undefined;
  return row ? rowToCluster(row) : undefined;
}

export function listClusters(db: Database.Database = getDb()): RiskCluster[] {
  const rows = db.prepare("SELECT * FROM risk_clusters ORDER BY name").all() as ClusterRow[];
  return rows.map(rowToCluster);
}
