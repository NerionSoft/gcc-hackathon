import { z } from "zod";

/**
 * Civic Property Intelligence — business data model (spec §3).
 *
 * These Zod schemas are the single source of truth for entity shapes.
 * The SQLite DDL in `client.ts` mirrors them; the access layer validates
 * every row crossing the boundary in either direction.
 */

// ============================================
// Enums (spec §3 — exact values, do not extend)
// ============================================

export const dimensionCodeSchema = z.enum([
  "BUILDING",
  "UNIT",
  "BLOCK",
  "PEOPLE",
  "LAND",
  "MARKET",
]);
export type DimensionCode = z.infer<typeof dimensionCodeSchema>;

export const severitySchema = z.enum(["green", "amber", "red"]);
export type Severity = z.infer<typeof severitySchema>;

export const propertyTypeSchema = z.enum(["residential", "mixed_use", "commercial", "land"]);
export type PropertyType = z.infer<typeof propertyTypeSchema>;

export const tenureSchema = z.enum(["freehold", "leasehold", "unknown"]);
export type Tenure = z.infer<typeof tenureSchema>;

export const capitalTypeSchema = z.enum(["public", "private", "community"]);
export type CapitalType = z.infer<typeof capitalTypeSchema>;

export const propertyStatusSchema = z.enum([
  "unscanned",
  "out_of_scope",
  "scanning",
  "signals_extracted",
  "in_cluster",
  "assessed",
  "verdict_pending_review",
  "cleared",
  "flagged",
  "escalated",
  "closed",
]);
export type PropertyStatus = z.infer<typeof propertyStatusSchema>;

export const clusterStatusSchema = z.enum([
  "draft",
  "pending_review",
  "approved",
  "published",
  "completed",
]);
export type ClusterStatus = z.infer<typeof clusterStatusSchema>;

export const adjudicationStatusSchema = z.enum([
  "queued",
  "assessing",
  "monitoring",
  "evidence_received",
  "adjudicated",
  "resolved",
  "escalated",
]);
export type AdjudicationStatus = z.infer<typeof adjudicationStatusSchema>;

export const escalationReasonSchema = z.enum([
  "insufficient_or_conflicting_evidence",
  "high_severity_single_source",
  "material_new_adverse_evidence",
  "fairness_guardrail_triggered",
]);
export type EscalationReason = z.infer<typeof escalationReasonSchema>;

export const actorSchema = z.union([z.literal("agent"), z.literal("user:nadia")]);
export type Actor = z.infer<typeof actorSchema>;

/**
 * Real/simulated boundary, kept explicit in data (spec §7.5):
 * - "real_open_data": a real address whose signals come from cached real
 *   open-data records (scenario metadata value/intendedUse/capitalType is
 *   still simulated — see README).
 * - "synthetic": a fictional address with pre-computed plausible signals,
 *   present only for portfolio scale.
 */
export const provenanceSchema = z.enum(["real_open_data", "synthetic"]);
export type Provenance = z.infer<typeof provenanceSchema>;

// ============================================
// Shared value objects
// ============================================

const isoDateTime = z.iso.datetime({ offset: true });

/**
 * Provenance of a single open-data record. MANDATORY on every RiskSignal —
 * "no evidence, no finding" is enforced in the access layer, not the prompt.
 */
export const sourceRefSchema = z.object({
  dataset: z.string().min(1),
  recordId: z.string().min(1),
  url: z.url(),
  retrievedAt: isoDateTime,
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

/** Which open source answers a signal definition, and under what licence. */
export const signalSourceSchema = z.object({
  dataset: z.string().min(1),
  endpoint: z.string().min(1),
  licence: z.string().min(1),
});
export type SignalSource = z.infer<typeof signalSourceSchema>;

/** Expert-defined thresholds: what makes a finding green / amber / red. */
export const severityRubricSchema = z.object({
  green: z.string().min(1),
  amber: z.string().min(1),
  red: z.string().min(1),
});
export type SeverityRubric = z.infer<typeof severityRubricSchema>;

// ============================================
// Referential: RiskFramework → RiskDimension → RiskSignalDefinition
// ============================================

export const riskSignalDefinitionSchema = z.object({
  id: z.string().min(1),
  dimensionCode: dimensionCodeSchema,
  code: z.string().regex(/^(BUILDING|UNIT|BLOCK|PEOPLE|LAND|MARKET)-[A-Z][A-Z-]*$/, {
    message: "Signal codes look like LAND-FLOOD / BUILDING-ENERGY",
  }),
  title: z.string().min(1),
  description: z.string().min(1),
  source: signalSourceSchema,
  method: z.string().min(1),
  severityRubric: severityRubricSchema,
});
export type RiskSignalDefinition = z.infer<typeof riskSignalDefinitionSchema>;

export const riskDimensionSchema = z.object({
  id: z.string().min(1),
  code: dimensionCodeSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  signals: z.array(riskSignalDefinitionSchema),
});
export type RiskDimension = z.infer<typeof riskDimensionSchema>;

export const riskFrameworkSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  effectiveDate: isoDateTime,
  dimensions: z.array(riskDimensionSchema),
});
export type RiskFramework = z.infer<typeof riskFrameworkSchema>;

// ============================================
// Property
// ============================================

export const propertySchema = z.object({
  id: z.string().min(1),
  uprn: z.string().min(1).nullable(),
  address: z.string().min(1),
  postcode: z.string().min(1),
  localAuthority: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  propertyType: propertyTypeSchema,
  tenure: tenureSchema,
  /** Committed/considered capital in GBP. Simulated scenario metadata. */
  value: z.number().nonnegative(),
  /** Simulated scenario metadata (e.g. "social housing acquisition"). */
  intendedUse: z.string().min(1),
  capitalType: capitalTypeSchema,
  status: propertyStatusSchema,
  provenance: provenanceSchema,
});
export type Property = z.infer<typeof propertySchema>;

// ============================================
// RiskSignal — a sourced finding for one signal on one property
// ============================================

export const riskSignalSchema = z.object({
  id: z.string().min(1),
  propertyId: z.string().min(1),
  signalCode: z.string().min(1),
  dimensionCode: dimensionCodeSchema,
  /** Readable statement of what was found. */
  finding: z.string().min(1),
  /** MANDATORY — a signal without a complete sourceRef is rejected. */
  sourceRef: sourceRefSchema,
  severity: severitySchema,
  confidence: z.number().min(0).max(1),
  /** Why this severity, citing the record. */
  rationale: z.string().min(1),
});
export type RiskSignal = z.infer<typeof riskSignalSchema>;

// ============================================
// RiskCluster
// ============================================

export const riskClusterSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    propertyIds: z.array(z.string().min(1)),
    /** Shared risk signature, e.g. "LAND-FLOOD:red + BUILDING-ENERGY:red". */
    pattern: z.string().min(1),
    groupingRationale: z.string().min(1),
    proposedAssessment: z.string().nullable(),
    proposedDisclosure: z.string().nullable(),
    status: clusterStatusSchema,
    reviewedBy: z.string().nullable(),
    reviewedAt: isoDateTime.nullable(),
  })
  .refine((c) => !["approved", "published", "completed"].includes(c.status) || c.reviewedAt, {
    message: "A cluster cannot move past review while reviewedAt is null",
    path: ["reviewedAt"],
  });
export type RiskCluster = z.infer<typeof riskClusterSchema>;

// ============================================
// Adjudication
// ============================================

export const adjudicationSchema = z
  .object({
    id: z.string().min(1),
    propertyId: z.string().min(1),
    clusterId: z.string().min(1),
    status: adjudicationStatusSchema,
    compositeVerdict: severitySchema.nullable(),
    /** MANDATORY whenever a verdict exists — cites the signals. */
    verdictRationale: z.string().nullable(),
    latestEvidence: z.string().nullable(),
    escalationReason: escalationReasonSchema.nullable(),
    assessedAt: isoDateTime.nullable(),
    lastActivityAt: isoDateTime,
  })
  .refine((a) => a.compositeVerdict === null || (a.verdictRationale ?? "").trim().length > 0, {
    message: "verdictRationale is mandatory as soon as a compositeVerdict exists",
    path: ["verdictRationale"],
  });
export type Adjudication = z.infer<typeof adjudicationSchema>;

// ============================================
// AuditEvent — append-only provenance ledger
// ============================================

export const auditEventSchema = z.object({
  id: z.string().min(1),
  timestamp: isoDateTime,
  actor: actorSchema,
  action: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  rationale: z.string().min(1),
  payloadSnapshot: z.unknown().nullable(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

// ============================================
// EvidenceUpdate — pre-written feed items replayed by the simulator
// (seed-owned; spec §4.3/§7 — deterministic demo, no live LLM loop)
// ============================================

export const evidenceKindSchema = z.enum(["corroborating", "new_minor", "material_adverse"]);
export type EvidenceKind = z.infer<typeof evidenceKindSchema>;

export const evidenceUpdateSchema = z.object({
  id: z.string().min(1),
  kind: evidenceKindSchema,
  /** Severity the update carries: corroborating→green, new_minor→amber, material_adverse→red. */
  severity: severitySchema,
  dimensionCode: dimensionCodeSchema,
  signalCode: z.string().min(1),
  headline: z.string().min(1),
  detail: z.string().min(1),
  sourceRef: sourceRefSchema,
});
export type EvidenceUpdate = z.infer<typeof evidenceUpdateSchema>;
