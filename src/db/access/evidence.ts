import type Database from "better-sqlite3";
import { getDb } from "@/db/client";
import { evidenceUpdateSchema, type EvidenceUpdate } from "@/db/schema";

/**
 * Pre-written evidence-feed updates, seeded once and replayed by the
 * evidence-feed simulator (spec §4.3) — deterministic demo, no live LLM loop.
 */

interface EvidenceRow {
  id: string;
  kind: string;
  severity: string;
  dimension_code: string;
  signal_code: string;
  headline: string;
  detail: string;
  source_dataset: string;
  source_record_id: string;
  source_url: string;
  source_retrieved_at: string;
}

function rowToUpdate(row: EvidenceRow): EvidenceUpdate {
  return evidenceUpdateSchema.parse({
    id: row.id,
    kind: row.kind,
    severity: row.severity,
    dimensionCode: row.dimension_code,
    signalCode: row.signal_code,
    headline: row.headline,
    detail: row.detail,
    sourceRef: {
      dataset: row.source_dataset,
      recordId: row.source_record_id,
      url: row.source_url,
      retrievedAt: row.source_retrieved_at,
    },
  });
}

export function insertEvidenceUpdate(
  candidate: unknown,
  db: Database.Database = getDb(),
): EvidenceUpdate {
  const e = evidenceUpdateSchema.parse(candidate);
  db.prepare(
    `INSERT INTO evidence_updates (
       id, kind, severity, dimension_code, signal_code, headline, detail,
       source_dataset, source_record_id, source_url, source_retrieved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    e.id,
    e.kind,
    e.severity,
    e.dimensionCode,
    e.signalCode,
    e.headline,
    e.detail,
    e.sourceRef.dataset,
    e.sourceRef.recordId,
    e.sourceRef.url,
    e.sourceRef.retrievedAt,
  );
  return e;
}

export function listEvidenceUpdates(db: Database.Database = getDb()): EvidenceUpdate[] {
  const rows = db.prepare("SELECT * FROM evidence_updates ORDER BY id").all() as EvidenceRow[];
  return rows.map(rowToUpdate);
}
