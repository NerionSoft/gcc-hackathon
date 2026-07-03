import type Database from "better-sqlite3";
import { getDb } from "@/db/client";
import { appendAuditEvent } from "@/db/access/audit";
import { riskSignalSchema, type RiskSignal } from "@/db/schema";
import { getLogger } from "@/infrastructure/logging/logger";

const logger = getLogger("db:risk-signals");

/**
 * RiskSignal persistence with the cardinal rule baked in (spec §1, §3):
 * a signal can NEVER be persisted or emitted without a complete
 * sourceRef {dataset, recordId, url, retrievedAt} AND a confidence.
 *
 * There is no code path around `validateEmittableSignal` — the insert
 * function is the only writer, and it rejects and journals invalid
 * candidates as failed extractions.
 */

interface SignalRow {
  id: string;
  property_id: string;
  signal_code: string;
  dimension_code: string;
  finding: string;
  source_dataset: string;
  source_record_id: string;
  source_url: string;
  source_retrieved_at: string;
  severity: string;
  confidence: number;
  rationale: string;
}

function rowToSignal(row: SignalRow): RiskSignal {
  return riskSignalSchema.parse({
    id: row.id,
    propertyId: row.property_id,
    signalCode: row.signal_code,
    dimensionCode: row.dimension_code,
    finding: row.finding,
    sourceRef: {
      dataset: row.source_dataset,
      recordId: row.source_record_id,
      url: row.source_url,
      retrievedAt: row.source_retrieved_at,
    },
    severity: row.severity,
    confidence: row.confidence,
    rationale: row.rationale,
  });
}

export type SignalValidation =
  | { ok: true; signal: RiskSignal }
  | { ok: false; reason: "unsourced_or_invalid_signal"; issues: string[] };

/**
 * Gate every candidate signal through the evidence rule. Also used by the
 * agent layer before EMITTING a signal anywhere (UI, workflow state).
 */
export function validateEmittableSignal(candidate: unknown): SignalValidation {
  const parsed = riskSignalSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, signal: parsed.data };
  const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
  return { ok: false, reason: "unsourced_or_invalid_signal", issues };
}

export type InsertSignalResult =
  | { ok: true; signal: RiskSignal }
  | { ok: false; reason: "unsourced_or_invalid_signal"; issues: string[] };

/**
 * Persist a risk signal. Candidates without a complete sourceRef or
 * confidence are rejected, logged, and journalled as failed extractions —
 * they never reach the table (whose columns are NOT NULL anyway).
 */
export function insertRiskSignal(
  candidate: unknown,
  db: Database.Database = getDb(),
): InsertSignalResult {
  const validation = validateEmittableSignal(candidate);

  if (!validation.ok) {
    logger.warn("Rejected risk signal without complete sourceRef/confidence", {
      issues: validation.issues,
    });
    const c = candidate as Partial<RiskSignal> | null;
    appendAuditEvent(
      {
        actor: "agent",
        action: "signal_extraction_failed",
        entityType: "RiskSignal",
        entityId: c?.propertyId ?? "unknown",
        rationale:
          "Evidence rule: a finding without a complete sourceRef and confidence cannot be recorded. " +
          `Validation issues: ${validation.issues.join("; ")}`,
        payloadSnapshot: candidate,
      },
      db,
    );
    return validation;
  }

  const s = validation.signal;
  db.prepare(
    `INSERT INTO risk_signals (
       id, property_id, signal_code, dimension_code, finding,
       source_dataset, source_record_id, source_url, source_retrieved_at,
       severity, confidence, rationale)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    s.id,
    s.propertyId,
    s.signalCode,
    s.dimensionCode,
    s.finding,
    s.sourceRef.dataset,
    s.sourceRef.recordId,
    s.sourceRef.url,
    s.sourceRef.retrievedAt,
    s.severity,
    s.confidence,
    s.rationale,
  );

  return { ok: true, signal: s };
}

export function listSignalsForProperty(
  propertyId: string,
  db: Database.Database = getDb(),
): RiskSignal[] {
  const rows = db
    .prepare("SELECT * FROM risk_signals WHERE property_id = ? ORDER BY signal_code")
    .all(propertyId) as SignalRow[];
  return rows.map(rowToSignal);
}

export function countSignals(db: Database.Database = getDb()): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM risk_signals").get() as { n: number };
  return row.n;
}
