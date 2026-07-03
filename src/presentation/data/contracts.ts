import { z } from "zod";
import {
  adjudicationSchema,
  adjudicationStatusSchema,
  capitalTypeSchema,
  escalationReasonSchema,
  propertySchema,
  propertyStatusSchema,
  propertyTypeSchema,
  provenanceSchema,
  riskClusterSchema,
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

// ============================================
// Campaign run (F1/F2 wiring — real engine scanPortfolio)
// ============================================

/** The suspend gate a run waits at + the live wall counters (spec §4.2). */
export const campaignStatusSchema = z.object({
  runId: z.string(),
  status: z.string(),
  suspendedSteps: z.array(z.string()),
  suspendPayloads: z.record(z.string(), z.unknown()),
});
export type CampaignStatus = z.infer<typeof campaignStatusSchema>;

export const scanStartResponseSchema = z.object({
  runId: z.string(),
  status: z.string(),
});
export type ScanStartResponse = z.infer<typeof scanStartResponseSchema>;

export const scanStatusResponseSchema = campaignStatusSchema.extend({
  counts: z.object({
    byStatus: z.record(z.string(), z.number()),
    byLocalAuthority: z.record(z.string(), z.number()),
    capitalUnderReviewGbp: z.number(),
  }),
});
export type ScanStatusResponse = z.infer<typeof scanStatusResponseSchema>;

// ============================================
// F3 — cluster sheet & review gate
// ============================================

export const clusterMemberSchema = z.object({
  property: propertySchema.nullable(),
  signals: z.array(riskSignalSchema),
});
export type ClusterMember = z.infer<typeof clusterMemberSchema>;

export const clusterDetailResponseSchema = z.object({
  cluster: riskClusterSchema,
  memberCount: z.number().int().nonnegative(),
  members: z.array(clusterMemberSchema),
});
export type ClusterDetailResponse = z.infer<typeof clusterDetailResponseSchema>;

export const reviewDecisionSchema = z.enum(["approve", "request_changes"]);
export type ReviewDecisionKind = z.infer<typeof reviewDecisionSchema>;

export const reviewResponseSchema = z.object({
  clusterId: z.string(),
  decision: reviewDecisionSchema,
  campaign: campaignStatusSchema,
});
export type ReviewResponse = z.infer<typeof reviewResponseSchema>;

// ============================================
// F4 — adjudication war room
// ============================================

/** One board card: the adjudication joined to its property + cluster. */
export const adjudicationBoardItemSchema = z.object({
  id: z.string(),
  propertyId: z.string(),
  clusterId: z.string(),
  clusterName: z.string(),
  address: z.string(),
  postcode: z.string(),
  localAuthority: z.string(),
  propertyType: propertyTypeSchema,
  capitalType: capitalTypeSchema,
  value: z.number(),
  status: adjudicationStatusSchema,
  compositeVerdict: severitySchema.nullable(),
  verdictRationale: z.string().nullable(),
  latestEvidence: z.string().nullable(),
  escalationReason: escalationReasonSchema.nullable(),
  assessedAt: z.string().nullable(),
  lastActivityAt: z.string(),
});
export type AdjudicationBoardItem = z.infer<typeof adjudicationBoardItemSchema>;

export const adjudicationBoardResponseSchema = z.object({
  adjudications: z.array(adjudicationBoardItemSchema),
  /** Whether the campaign is suspended at the human-adjudication gate. */
  atHumanGate: z.boolean(),
});
export type AdjudicationBoardResponse = z.infer<typeof adjudicationBoardResponseSchema>;

export const adjudicationActionKindSchema = z.enum([
  "confirm_risk",
  "request_more_evidence",
  "mark_resolved",
]);
export type AdjudicationActionKind = z.infer<typeof adjudicationActionKindSchema>;

export const adjudicationActionResponseSchema = z.object({
  adjudicationId: z.string(),
  action: adjudicationActionKindSchema,
  via: z.enum(["workflow_resume", "engine"]),
  campaign: campaignStatusSchema.optional(),
  adjudication: adjudicationSchema.optional(),
});
export type AdjudicationActionResponse = z.infer<typeof adjudicationActionResponseSchema>;

// ============================================
// F5 — live impact banner
// ============================================

export const impactMetricsSchema = z.object({
  propertiesTotal: z.number().int(),
  propertiesAssessed: z.number().int(),
  propertiesOutOfScope: z.number().int(),
  statusCounts: z.record(z.string(), z.number().int()),
  analystHoursSaved: z.number(),
  capitalScreenedGbp: z.number(),
  escalatedCount: z.number().int(),
  escalatedPct: z.number(),
  hiddenRisksRevealed: z.number().int(),
  sourcesCited: z.number().int(),
  distinctDatasets: z.number().int(),
  auditEvents: z.number().int(),
});
export type ImpactMetrics = z.infer<typeof impactMetricsSchema>;

// ============================================
// F7 — evidence-feed simulator (director controls + war-room ticker)
// ============================================

export const simulatorStateSchema = z.object({
  status: z.enum(["idle", "running", "paused", "done"]),
  cursor: z.number().int(),
  totalUpdates: z.number().int(),
  intervalMs: z.number().int(),
  lastUpdate: z
    .object({ id: z.string(), headline: z.string(), propertyId: z.string() })
    .nullable(),
  lastError: z.string().nullable(),
});
export type SimulatorState = z.infer<typeof simulatorStateSchema>;

export const simulatorCommandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("start"), intervalMs: z.number().int().min(250).optional() }),
  z.object({ command: z.literal("pause") }),
  z.object({ command: z.literal("speed"), intervalMs: z.number().int().min(250) }),
  z.object({ command: z.literal("reset") }),
]);
export type SimulatorCommand = z.infer<typeof simulatorCommandSchema>;
