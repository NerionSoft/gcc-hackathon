import type Database from "better-sqlite3";
import { getDb } from "@/db/client";
import { adjudicationSchema, type Adjudication } from "@/db/schema";

interface AdjudicationRow {
  id: string;
  property_id: string;
  cluster_id: string;
  status: string;
  composite_verdict: string | null;
  verdict_rationale: string | null;
  latest_evidence: string | null;
  escalation_reason: string | null;
  assessed_at: string | null;
  last_activity_at: string;
}

function rowToAdjudication(row: AdjudicationRow): Adjudication {
  return adjudicationSchema.parse({
    id: row.id,
    propertyId: row.property_id,
    clusterId: row.cluster_id,
    status: row.status,
    compositeVerdict: row.composite_verdict,
    verdictRationale: row.verdict_rationale,
    latestEvidence: row.latest_evidence,
    escalationReason: row.escalation_reason,
    assessedAt: row.assessed_at,
    lastActivityAt: row.last_activity_at,
  });
}

/**
 * Insert or replace an adjudication. The schema refinement enforces that a
 * verdictRationale exists as soon as a compositeVerdict does (spec §3).
 */
export function upsertAdjudication(
  candidate: unknown,
  db: Database.Database = getDb(),
): Adjudication {
  const a = adjudicationSchema.parse(candidate);
  db.prepare(
    `INSERT INTO adjudications (
       id, property_id, cluster_id, status, composite_verdict, verdict_rationale,
       latest_evidence, escalation_reason, assessed_at, last_activity_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       composite_verdict = excluded.composite_verdict,
       verdict_rationale = excluded.verdict_rationale,
       latest_evidence = excluded.latest_evidence,
       escalation_reason = excluded.escalation_reason,
       assessed_at = excluded.assessed_at,
       last_activity_at = excluded.last_activity_at`,
  ).run(
    a.id,
    a.propertyId,
    a.clusterId,
    a.status,
    a.compositeVerdict,
    a.verdictRationale,
    a.latestEvidence,
    a.escalationReason,
    a.assessedAt,
    a.lastActivityAt,
  );
  return a;
}

export function getAdjudication(
  id: string,
  db: Database.Database = getDb(),
): Adjudication | undefined {
  const row = db.prepare("SELECT * FROM adjudications WHERE id = ?").get(id) as
    | AdjudicationRow
    | undefined;
  return row ? rowToAdjudication(row) : undefined;
}

export function listAdjudications(db: Database.Database = getDb()): Adjudication[] {
  const rows = db
    .prepare("SELECT * FROM adjudications ORDER BY last_activity_at DESC")
    .all() as AdjudicationRow[];
  return rows.map(rowToAdjudication);
}
