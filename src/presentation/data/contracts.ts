import { z } from "zod";
import {
  adjudicationSchema,
  capitalTypeSchema,
  propertySchema,
  propertyStatusSchema,
  propertyTypeSchema,
  provenanceSchema,
  riskSignalSchema,
  severitySchema,
} from "@/db/schema";

/**
 * API contracts shared by the read-only route handlers and the client-side
 * `api.ts` module. Both sides parse with these schemas, so swapping the thin
 * phase-4 endpoints for the engine worker's richer ones only has to keep (or
 * extend) these shapes.
 */

// ============================================
// Portfolio wall (F1)
// ============================================

/** Compact per-property DTO — 2,800 of these ship to the wall in one payload. */
export const portfolioTileSchema = z.object({
  id: z.string(),
  address: z.string(),
  postcode: z.string(),
  localAuthority: z.string(),
  propertyType: propertyTypeSchema,
  capitalType: capitalTypeSchema,
  value: z.number(),
  status: propertyStatusSchema,
  provenance: provenanceSchema,
  /** Worst stored-signal severity, null while nothing is extracted. */
  dominantSeverity: severitySchema.nullable(),
  signalCount: z.number().int().nonnegative(),
  redCount: z.number().int().nonnegative(),
  amberCount: z.number().int().nonnegative(),
  /** Dimension codes that carry at least one amber/red signal. */
  adverseDimensions: z.array(z.string()),
});
export type PortfolioTile = z.infer<typeof portfolioTileSchema>;

export const portfolioResponseSchema = z.object({
  properties: z.array(portfolioTileSchema),
});
export type PortfolioResponse = z.infer<typeof portfolioResponseSchema>;

export const portfolioSummarySchema = z.object({
  totalProperties: z.number().int(),
  statusCounts: z.record(z.string(), z.number().int()),
  /** GBP sum of `value` across the portfolio. */
  capitalUnderReview: z.number(),
  signalCount: z.number().int(),
  framework: z.object({
    name: z.string(),
    version: z.string(),
    dimensionCount: z.number().int(),
  }),
  /** Latest sourceRef.retrievedAt across stored signals — data freshness. */
  sourcesRefreshedAt: z.string().nullable(),
  localAuthorities: z.array(z.string()),
});
export type PortfolioSummary = z.infer<typeof portfolioSummarySchema>;

// ============================================
// Clusters (F2 targets)
// ============================================

export const clusterCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  /** Shared risk signature, e.g. "LAND-FLOOD:red + BUILDING-ENERGY:amber". */
  pattern: z.string(),
  groupingRationale: z.string(),
  propertyIds: z.array(z.string()),
  propertyCount: z.number().int().nonnegative(),
  dominantSeverity: severitySchema.nullable(),
  status: z.string(),
});
export type ClusterCard = z.infer<typeof clusterCardSchema>;

export const clustersResponseSchema = z.object({
  /**
   * true while the engine worker's deterministic `clusterByRiskPattern` has
   * not persisted clusters yet — the API then serves a deterministic preview
   * derived from stored signals so the UI (and the condensation shot) works.
   */
  preview: z.boolean(),
  clusters: z.array(clusterCardSchema),
});
export type ClustersResponse = z.infer<typeof clustersResponseSchema>;

// ============================================
// Dossier (F0)
// ============================================

export const dossierResponseSchema = z.object({
  property: propertySchema,
  signals: z.array(riskSignalSchema),
  adjudication: adjudicationSchema.nullable(),
});
export type DossierResponse = z.infer<typeof dossierResponseSchema>;

// ============================================
// Search (F0 resolver)
// ============================================

export const searchResultSchema = z.object({
  id: z.string(),
  address: z.string(),
  postcode: z.string(),
  localAuthority: z.string(),
  uprn: z.string().nullable(),
  status: propertyStatusSchema,
  provenance: provenanceSchema,
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchResponseSchema = z.object({
  query: z.string(),
  results: z.array(searchResultSchema),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

// ============================================
// Scan stub (engine worker replaces the handler, contract stays)
// ============================================

export const scanRequestResponseSchema = z.object({
  accepted: z.boolean(),
  propertyId: z.string(),
  message: z.string(),
});
export type ScanRequestResponse = z.infer<typeof scanRequestResponseSchema>;
