import type { DimensionCode, PropertyStatus, Severity } from "@/db/schema";

/**
 * Severity → colour, the ONLY decorative use of colour in the app (SPEC §6:
 * colour carries severity meaning, never decoration). Tints are light washes
 * of the three state colours for badge/tile backgrounds.
 */
export interface SeverityMeta {
  label: string;
  /** Solid state colour. */
  color: string;
  /** Light wash for backgrounds. */
  tint: string;
  /** Slightly stronger wash for borders. */
  edge: string;
}

export const SEVERITY_META: Record<Severity, SeverityMeta> = {
  green: { label: "Green", color: "#1E8E5A", tint: "#EAF5F0", edge: "#C6E3D4" },
  amber: { label: "Amber", color: "#C77D1E", tint: "#FBF3E7", edge: "#EDD9B8" },
  red: { label: "Red", color: "#C0392B", tint: "#FAECEA", edge: "#EFCCC7" },
};

export const SEVERITY_ORDER: Record<Severity, number> = { green: 1, amber: 2, red: 3 };

export function worstSeverity(severities: readonly Severity[]): Severity | null {
  let worst: Severity | null = null;
  for (const s of severities) {
    if (worst === null || SEVERITY_ORDER[s] > SEVERITY_ORDER[worst]) worst = s;
  }
  return worst;
}

/**
 * Property status → visual tone. Statuses that CARRY a severity meaning
 * (cleared / flagged / escalated) borrow the state colours; pure workflow
 * states stay neutral or navy so colour keeps its meaning.
 */
export type StatusTone = "neutral" | "muted" | "active" | "green" | "amber" | "red";

export const STATUS_TONE: Record<PropertyStatus, StatusTone> = {
  unscanned: "neutral",
  out_of_scope: "muted",
  scanning: "active",
  signals_extracted: "active",
  in_cluster: "active",
  assessed: "active",
  verdict_pending_review: "active",
  cleared: "green",
  flagged: "amber",
  escalated: "red",
  closed: "neutral",
};

export const DIMENSION_LABEL: Record<DimensionCode, string> = {
  BUILDING: "Building",
  UNIT: "Unit",
  BLOCK: "Block",
  PEOPLE: "People",
  LAND: "Land",
  MARKET: "Market",
};

export const STATUS_LABEL: Record<PropertyStatus, string> = {
  unscanned: "Unscanned",
  out_of_scope: "Out of scope",
  scanning: "Scanning",
  signals_extracted: "Signals extracted",
  in_cluster: "In cluster",
  assessed: "Assessed",
  verdict_pending_review: "Pending review",
  cleared: "Cleared",
  flagged: "Flagged",
  escalated: "Escalated",
  closed: "Closed",
};
