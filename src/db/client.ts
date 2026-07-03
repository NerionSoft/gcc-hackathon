import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import Database from "better-sqlite3";
import { env } from "@/infrastructure/config/env";

/**
 * Local SQLite database for the business model (see ADR 0001).
 * The database is disposable: `pnpm seed` rebuilds it from scratch.
 */

let db: Database.Database | undefined;

const DDL = `
CREATE TABLE IF NOT EXISTS risk_frameworks (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  version        TEXT NOT NULL,
  effective_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS risk_dimensions (
  id           TEXT PRIMARY KEY,
  framework_id TEXT NOT NULL REFERENCES risk_frameworks(id),
  code         TEXT NOT NULL CHECK (code IN ('BUILDING','UNIT','BLOCK','PEOPLE','LAND','MARKET')),
  title        TEXT NOT NULL,
  description  TEXT NOT NULL,
  UNIQUE (framework_id, code)
);

CREATE TABLE IF NOT EXISTS risk_signal_definitions (
  id              TEXT PRIMARY KEY,
  dimension_id    TEXT NOT NULL REFERENCES risk_dimensions(id),
  dimension_code  TEXT NOT NULL,
  code            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  source_dataset  TEXT NOT NULL,
  source_endpoint TEXT NOT NULL,
  source_licence  TEXT NOT NULL,
  method          TEXT NOT NULL,
  severity_rubric TEXT NOT NULL -- JSON {green, amber, red}
);

CREATE TABLE IF NOT EXISTS properties (
  id              TEXT PRIMARY KEY,
  uprn            TEXT,
  address         TEXT NOT NULL,
  postcode        TEXT NOT NULL,
  local_authority TEXT NOT NULL,
  lat             REAL NOT NULL,
  lng             REAL NOT NULL,
  property_type   TEXT NOT NULL CHECK (property_type IN ('residential','mixed_use','commercial','land')),
  tenure          TEXT NOT NULL CHECK (tenure IN ('freehold','leasehold','unknown')),
  value           REAL NOT NULL,
  intended_use    TEXT NOT NULL,
  capital_type    TEXT NOT NULL CHECK (capital_type IN ('public','private','community')),
  status          TEXT NOT NULL CHECK (status IN (
    'unscanned','out_of_scope','scanning','signals_extracted','in_cluster',
    'assessed','verdict_pending_review','cleared','flagged','escalated','closed')),
  provenance      TEXT NOT NULL CHECK (provenance IN ('real_open_data','synthetic'))
);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_local_authority ON properties(local_authority);

CREATE TABLE IF NOT EXISTS risk_signals (
  id                  TEXT PRIMARY KEY,
  property_id         TEXT NOT NULL REFERENCES properties(id),
  signal_code         TEXT NOT NULL,
  dimension_code      TEXT NOT NULL CHECK (dimension_code IN ('BUILDING','UNIT','BLOCK','PEOPLE','LAND','MARKET')),
  finding             TEXT NOT NULL,
  -- sourceRef: every column NOT NULL — a signal without provenance cannot exist here
  source_dataset      TEXT NOT NULL,
  source_record_id    TEXT NOT NULL,
  source_url          TEXT NOT NULL,
  source_retrieved_at TEXT NOT NULL,
  severity            TEXT NOT NULL CHECK (severity IN ('green','amber','red')),
  confidence          REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  rationale           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_risk_signals_property ON risk_signals(property_id);

CREATE TABLE IF NOT EXISTS risk_clusters (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  description         TEXT NOT NULL,
  property_ids        TEXT NOT NULL, -- JSON string[]
  pattern             TEXT NOT NULL,
  grouping_rationale  TEXT NOT NULL,
  proposed_assessment TEXT,
  proposed_disclosure TEXT,
  status              TEXT NOT NULL CHECK (status IN ('draft','pending_review','approved','published','completed')),
  reviewed_by         TEXT,
  reviewed_at         TEXT
);

CREATE TABLE IF NOT EXISTS adjudications (
  id                TEXT PRIMARY KEY,
  property_id       TEXT NOT NULL REFERENCES properties(id),
  cluster_id        TEXT NOT NULL REFERENCES risk_clusters(id),
  status            TEXT NOT NULL CHECK (status IN (
    'queued','assessing','monitoring','evidence_received','adjudicated','resolved','escalated')),
  composite_verdict TEXT CHECK (composite_verdict IN ('green','amber','red')),
  verdict_rationale TEXT,
  latest_evidence   TEXT,
  escalation_reason TEXT CHECK (escalation_reason IN (
    'insufficient_or_conflicting_evidence','high_severity_single_source',
    'material_new_adverse_evidence','fairness_guardrail_triggered')),
  assessed_at       TEXT,
  last_activity_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_adjudications_status ON adjudications(status);

CREATE TABLE IF NOT EXISTS audit_events (
  id               TEXT PRIMARY KEY,
  timestamp        TEXT NOT NULL,
  actor            TEXT NOT NULL CHECK (actor IN ('agent','user:nadia')),
  action           TEXT NOT NULL,
  entity_type      TEXT NOT NULL,
  entity_id        TEXT NOT NULL,
  rationale        TEXT NOT NULL,
  payload_snapshot TEXT -- JSON
);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type, entity_id);

-- Defence in depth: the access layer exposes no update/delete for audit events,
-- and the database itself refuses them too.
CREATE TRIGGER IF NOT EXISTS audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only');
END;

CREATE TABLE IF NOT EXISTS evidence_updates (
  id                  TEXT PRIMARY KEY,
  kind                TEXT NOT NULL CHECK (kind IN ('corroborating','new_minor','material_adverse')),
  severity            TEXT NOT NULL CHECK (severity IN ('green','amber','red')),
  dimension_code      TEXT NOT NULL CHECK (dimension_code IN ('BUILDING','UNIT','BLOCK','PEOPLE','LAND','MARKET')),
  signal_code         TEXT NOT NULL,
  headline            TEXT NOT NULL,
  detail              TEXT NOT NULL,
  source_dataset      TEXT NOT NULL,
  source_record_id    TEXT NOT NULL,
  source_url          TEXT NOT NULL,
  source_retrieved_at TEXT NOT NULL
);
`;

function open(path: string): Database.Database {
  const filePath = isAbsolute(path) ? path : resolve(process.cwd(), path);
  mkdirSync(dirname(filePath), { recursive: true });
  const database = new Database(filePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(DDL);
  return database;
}

/** Singleton connection; creates the schema on first use. */
export function getDb(): Database.Database {
  if (!db) db = open(env.SQLITE_PATH);
  return db;
}

/** For tests: open an isolated database (e.g. ":memory:"). */
export function openDb(path: string): Database.Database {
  if (path === ":memory:") {
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    database.exec(DDL);
    return database;
  }
  return open(path);
}

export function closeDb(): void {
  db?.close();
  db = undefined;
}
