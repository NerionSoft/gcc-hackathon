import { getDb } from "@/db/client";
import { propertyStatusSchema, severitySchema, type Severity } from "@/db/schema";
import { z } from "zod";

/**
 * Read models for the portfolio wall (F1): 2,800 lite tiles with their
 * dominant severity, plus live status counters. Query-only.
 */

export const portfolioFilterSchema = z.object({
  status: propertyStatusSchema.optional(),
  localAuthority: z.string().min(1).optional(),
  severity: severitySchema.optional(),
  dimension: z.string().min(1).optional(),
  capitalType: z.enum(["public", "private", "community"]).optional(),
  limit: z.coerce.number().int().positive().max(5000).default(3000),
  offset: z.coerce.number().int().nonnegative().default(0),
});
export type PortfolioFilter = z.infer<typeof portfolioFilterSchema>;

export interface PortfolioTile {
  id: string;
  address: string;
  postcode: string;
  localAuthority: string;
  propertyType: string;
  capitalType: string;
  value: number;
  status: string;
  provenance: string;
  /** Worst signal severity, null before signals exist. Drives tile colour. */
  dominantSeverity: Severity | null;
}

interface TileRow {
  id: string;
  address: string;
  postcode: string;
  local_authority: string;
  property_type: string;
  capital_type: string;
  value: number;
  status: string;
  provenance: string;
  dominant: string | null;
}

export function listPortfolio(filter: PortfolioFilter): {
  tiles: PortfolioTile[];
  total: number;
} {
  const db = getDb();
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    clauses.push("p.status = ?");
    params.push(filter.status);
  }
  if (filter.localAuthority) {
    clauses.push("p.local_authority = ?");
    params.push(filter.localAuthority);
  }
  if (filter.capitalType) {
    clauses.push("p.capital_type = ?");
    params.push(filter.capitalType);
  }
  if (filter.dimension) {
    clauses.push(
      "EXISTS (SELECT 1 FROM risk_signals d WHERE d.property_id = p.id AND d.dimension_code = ?)",
    );
    params.push(filter.dimension.toUpperCase());
  }
  const severityRank = "CASE s.severity WHEN 'red' THEN 2 WHEN 'amber' THEN 1 ELSE 0 END";
  const dominantExpr = `(
    SELECT s.severity FROM risk_signals s WHERE s.property_id = p.id
    ORDER BY ${severityRank} DESC LIMIT 1
  )`;
  if (filter.severity) {
    clauses.push(`${dominantExpr} = ?`);
    params.push(filter.severity);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM properties p ${where}`).get(...params) as { n: number }
  ).n;
  const rows = db
    .prepare(
      `SELECT p.id, p.address, p.postcode, p.local_authority, p.property_type,
              p.capital_type, p.value, p.status, p.provenance,
              ${dominantExpr} AS dominant
       FROM properties p ${where} ORDER BY p.id LIMIT ? OFFSET ?`,
    )
    .all(...params, filter.limit, filter.offset) as TileRow[];

  return {
    total,
    tiles: rows.map((r) => ({
      id: r.id,
      address: r.address,
      postcode: r.postcode,
      localAuthority: r.local_authority,
      propertyType: r.property_type,
      capitalType: r.capital_type,
      value: r.value,
      status: r.status,
      provenance: r.provenance,
      dominantSeverity: (r.dominant as Severity | null) ?? null,
    })),
  };
}

export function portfolioCounts(): {
  byStatus: Record<string, number>;
  byLocalAuthority: Record<string, number>;
  capitalUnderReviewGbp: number;
} {
  const db = getDb();
  const byStatus = Object.fromEntries(
    (
      db.prepare("SELECT status, COUNT(*) n FROM properties GROUP BY status").all() as {
        status: string;
        n: number;
      }[]
    ).map((r) => [r.status, r.n]),
  );
  const byLocalAuthority = Object.fromEntries(
    (
      db
        .prepare("SELECT local_authority la, COUNT(*) n FROM properties GROUP BY local_authority")
        .all() as { la: string; n: number }[]
    ).map((r) => [r.la, r.n]),
  );
  const capital = (
    db
      .prepare(
        `SELECT COALESCE(SUM(value), 0) v FROM properties
         WHERE status NOT IN ('unscanned', 'out_of_scope')`,
      )
      .get() as { v: number }
  ).v;
  return { byStatus, byLocalAuthority, capitalUnderReviewGbp: capital };
}
