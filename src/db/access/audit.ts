import type Database from "better-sqlite3";
import { getDb } from "@/db/client";
import { auditEventSchema, type Actor, type AuditEvent } from "@/db/schema";

/**
 * Append-only audit ledger (spec §3, §8).
 *
 * This module deliberately exposes NO update and NO delete. The table also
 * carries BEFORE UPDATE / BEFORE DELETE triggers that abort, so even raw SQL
 * elsewhere cannot rewrite history.
 */

interface AuditRow {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  rationale: string;
  payload_snapshot: string | null;
}

function rowToEvent(row: AuditRow): AuditEvent {
  return auditEventSchema.parse({
    id: row.id,
    timestamp: row.timestamp,
    actor: row.actor,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    rationale: row.rationale,
    payloadSnapshot: row.payload_snapshot === null ? null : JSON.parse(row.payload_snapshot),
  });
}

export interface AppendAuditEventInput {
  actor: Actor;
  action: string;
  entityType: string;
  entityId: string;
  rationale: string;
  payloadSnapshot?: unknown;
}

export function appendAuditEvent(
  input: AppendAuditEventInput,
  db: Database.Database = getDb(),
): AuditEvent {
  const event = auditEventSchema.parse({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actor: input.actor,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    rationale: input.rationale,
    payloadSnapshot: input.payloadSnapshot ?? null,
  });

  db.prepare(
    `INSERT INTO audit_events (id, timestamp, actor, action, entity_type, entity_id, rationale, payload_snapshot)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    event.id,
    event.timestamp,
    event.actor,
    event.action,
    event.entityType,
    event.entityId,
    event.rationale,
    event.payloadSnapshot === null ? null : JSON.stringify(event.payloadSnapshot),
  );

  return event;
}

export interface AuditEventFilter {
  entityType?: string;
  entityId?: string;
  actor?: Actor;
  limit?: number;
}

export function listAuditEvents(
  filter: AuditEventFilter = {},
  db: Database.Database = getDb(),
): AuditEvent[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.entityType) {
    clauses.push("entity_type = ?");
    params.push(filter.entityType);
  }
  if (filter.entityId) {
    clauses.push("entity_id = ?");
    params.push(filter.entityId);
  }
  if (filter.actor) {
    clauses.push("actor = ?");
    params.push(filter.actor);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = filter.limit ?? 500;
  const rows = db
    .prepare(`SELECT * FROM audit_events ${where} ORDER BY timestamp DESC LIMIT ?`)
    .all(...params, limit) as AuditRow[];
  return rows.map(rowToEvent);
}
