import type Database from "better-sqlite3";
import { getDb } from "@/db/client";
import {
  propertySchema,
  propertyStatusSchema,
  type Property,
  type PropertyStatus,
} from "@/db/schema";

interface PropertyRow {
  id: string;
  uprn: string | null;
  address: string;
  postcode: string;
  local_authority: string;
  lat: number;
  lng: number;
  property_type: string;
  tenure: string;
  value: number;
  intended_use: string;
  capital_type: string;
  status: string;
  provenance: string;
}

function rowToProperty(row: PropertyRow): Property {
  return propertySchema.parse({
    id: row.id,
    uprn: row.uprn,
    address: row.address,
    postcode: row.postcode,
    localAuthority: row.local_authority,
    lat: row.lat,
    lng: row.lng,
    propertyType: row.property_type,
    tenure: row.tenure,
    value: row.value,
    intendedUse: row.intended_use,
    capitalType: row.capital_type,
    status: row.status,
    provenance: row.provenance,
  });
}

export function insertProperty(candidate: unknown, db: Database.Database = getDb()): Property {
  const p = propertySchema.parse(candidate);
  db.prepare(
    `INSERT INTO properties (
       id, uprn, address, postcode, local_authority, lat, lng,
       property_type, tenure, value, intended_use, capital_type, status, provenance)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    p.id,
    p.uprn,
    p.address,
    p.postcode,
    p.localAuthority,
    p.lat,
    p.lng,
    p.propertyType,
    p.tenure,
    p.value,
    p.intendedUse,
    p.capitalType,
    p.status,
    p.provenance,
  );
  return p;
}

/** Bulk insert inside one transaction — the seed writes ~2,800 rows. */
export function insertProperties(candidates: unknown[], db: Database.Database = getDb()): number {
  const insertMany = db.transaction((items: unknown[]) => {
    for (const item of items) insertProperty(item, db);
    return items.length;
  });
  return insertMany(candidates);
}

export function getProperty(id: string, db: Database.Database = getDb()): Property | undefined {
  const row = db.prepare("SELECT * FROM properties WHERE id = ?").get(id) as
    | PropertyRow
    | undefined;
  return row ? rowToProperty(row) : undefined;
}

export interface PropertyFilter {
  status?: PropertyStatus;
  localAuthority?: string;
  limit?: number;
  offset?: number;
}

export function listProperties(
  filter: PropertyFilter = {},
  db: Database.Database = getDb(),
): Property[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    clauses.push("status = ?");
    params.push(filter.status);
  }
  if (filter.localAuthority) {
    clauses.push("local_authority = ?");
    params.push(filter.localAuthority);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM properties ${where} ORDER BY id LIMIT ? OFFSET ?`)
    .all(...params, filter.limit ?? 5000, filter.offset ?? 0) as PropertyRow[];
  return rows.map(rowToProperty);
}

export function updatePropertyStatus(
  id: string,
  status: PropertyStatus,
  db: Database.Database = getDb(),
): void {
  const parsed = propertyStatusSchema.parse(status);
  const result = db.prepare("UPDATE properties SET status = ? WHERE id = ?").run(parsed, id);
  if (result.changes === 0) throw new Error(`Property not found: ${id}`);
}

export function countProperties(db: Database.Database = getDb()): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM properties").get() as { n: number };
  return row.n;
}
