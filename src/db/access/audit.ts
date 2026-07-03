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
  /** Exact action match (e.g. "cluster_published"). */
  action?: string;
  /** Inclusive lower bound on `timestamp` (ISO 8601). */
  after?: string;
  /** Inclusive upper bound on `timestamp` (ISO 8601). */
  before?: string;
  limit?: number;
  offset?: number;
}

/** Build the shared WHERE clause + bound params for a filter (no LIMIT/OFFSET). */
function buildWhere(filter: AuditEventFilter): { where: string; params: unknown[] } {
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
  if (filter.action) {
    clauses.push("action = ?");
    params.push(filter.action);
  }
  if (filter.after) {
    clauses.push("timestamp >= ?");
    params.push(filter.after);
  }
  if (filter.before) {
    clauses.push("timestamp <= ?");
    params.push(filter.before);
  }
  return { where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

export function listAuditEvents(
  filter: AuditEventFilter = {},
  db: Database.Database = getDb(),
): AuditEvent[] {
  const { where, params } = buildWhere(filter);
  const limit = filter.limit ?? 500;
  const offset = filter.offset ?? 0;
  const rows = db
    .prepare(
      `SELECT * FROM audit_events ${where} ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as AuditRow[];
  return rows.map(rowToEvent);
}

/** Total events matching a filter — powers server-side pagination (F6). */
export function countAuditEvents(
  filter: AuditEventFilter = {},
  db: Database.Database = getDb(),
): number {
  const { where, params } = buildWhere(filter);
  const row = db.prepare(`SELECT COUNT(*) AS n FROM audit_events ${where}`).get(...params) as {
    n: number;
  };
  return row.n;
}

export interface AuditFacets {
  actions: string[];
  entityTypes: string[];
  actors: Actor[];
}

/** Distinct filterable values, so the F6 filter bar offers only real options. */
export function listAuditFacets(db: Database.Database = getDb()): AuditFacets {
  const actions = db
    .prepare("SELECT DISTINCT action FROM audit_events ORDER BY action")
    .all() as Array<{ action: string }>;
  const entityTypes = db
    .prepare("SELECT DISTINCT entity_type FROM audit_events ORDER BY entity_type")
    .all() as Array<{ entity_type: string }>;
  const actors = db
    .prepare("SELECT DISTINCT actor FROM audit_events ORDER BY actor")
    .all() as Array<{ actor: string }>;
  return {
    actions: actions.map((r) => r.action),
    entityTypes: entityTypes.map((r) => r.entity_type),
    actors: actors.map((r) => r.actor as Actor),
  };
}
