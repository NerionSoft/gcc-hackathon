import type { ZodType } from "zod";
import {
  adjudicationActionKindSchema,
  adjudicationActionResponseSchema,
  adjudicationBoardResponseSchema,
  clusterDetailResponseSchema,
  clustersResponseSchema,
  dossierResponseSchema,
  impactMetricsSchema,
  portfolioResponseSchema,
  portfolioSummarySchema,
  reviewDecisionSchema,
  reviewResponseSchema,
  scanRequestResponseSchema,
  scanStartResponseSchema,
  scanStatusResponseSchema,
  searchResponseSchema,
  simulatorStateSchema,
  type AdjudicationActionKind,
  type AdjudicationActionResponse,
  type AdjudicationBoardResponse,
  type ClusterDetailResponse,
  type ClustersResponse,
  type DossierResponse,
  type ImpactMetrics,
  type PortfolioResponse,
  type PortfolioSummary,
  type ReviewDecisionKind,
  type ReviewResponse,
  type ScanRequestResponse,
  type ScanStartResponse,
  type ScanStatusResponse,
  type SearchResponse,
  type SimulatorCommand,
  type SimulatorState,
} from "@/presentation/data/contracts";

/**
 * THE swap point between the UI and the backend (phase brief): every data
 * hook goes through this module and nothing else. When the engine worker's
 * richer endpoints land, only the paths/functions here change — components
 * and hooks stay untouched. Every response is Zod-parsed at this boundary.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function getJson<T>(path: string, schema: ZodType<T>): Promise<T> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  if (!res.ok) throw new ApiError(res.status, `${path} responded ${res.status}`);
  return schema.parse(await res.json());
}

async function postJson<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 202) {
    const message =
      (json as { error?: { message?: string } })?.error?.message ??
      `${path} responded ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return schema.parse(json);
}

export function fetchPortfolio(): Promise<PortfolioResponse> {
  return getJson("/api/portfolio", portfolioResponseSchema);
}

export function fetchPortfolioSummary(): Promise<PortfolioSummary> {
  return getJson("/api/portfolio/summary", portfolioSummarySchema);
}

export function fetchClusters(): Promise<ClustersResponse> {
  return getJson("/api/clusters", clustersResponseSchema);
}

export function fetchDossier(propertyId: string): Promise<DossierResponse> {
  return getJson(`/api/properties/${encodeURIComponent(propertyId)}`, dossierResponseSchema);
}

export function searchProperties(query: string): Promise<SearchResponse> {
  return getJson(`/api/search?q=${encodeURIComponent(query)}`, searchResponseSchema);
}

export async function requestFreshScan(propertyId: string): Promise<ScanRequestResponse> {
  const res = await fetch(`/api/properties/${encodeURIComponent(propertyId)}/scan`, {
    method: "POST",
    headers: { accept: "application/json" },
  });
  if (!res.ok && res.status !== 202) {
    throw new ApiError(res.status, `Scan request responded ${res.status}`);
  }
  return scanRequestResponseSchema.parse(await res.json());
}

// ============================================
// Campaign scan (F1/F2 — real engine)
// ============================================

export function startScan(input: { propertyIds?: string[] } = {}): Promise<ScanStartResponse> {
  return postJson("/api/scan/start", input, scanStartResponseSchema);
}

export function fetchScanStatus(): Promise<ScanStatusResponse> {
  return getJson("/api/scan/status", scanStatusResponseSchema);
}

// ============================================
// F3 — cluster sheet & review gate
// ============================================

export function fetchClusterDetail(clusterId: string): Promise<ClusterDetailResponse> {
  return getJson(`/api/clusters/${encodeURIComponent(clusterId)}`, clusterDetailResponseSchema);
}

export function reviewCluster(
  clusterId: string,
  decision: ReviewDecisionKind,
  comments?: string,
): Promise<ReviewResponse> {
  return postJson(
    `/api/clusters/${encodeURIComponent(clusterId)}/review`,
    { decision: reviewDecisionSchema.parse(decision), comments },
    reviewResponseSchema,
  );
}

// ============================================
// F4 — adjudication war room
// ============================================

export function fetchAdjudications(): Promise<AdjudicationBoardResponse> {
  return getJson("/api/adjudications", adjudicationBoardResponseSchema);
}

export function actOnAdjudication(
  adjudicationId: string,
  action: AdjudicationActionKind,
  comments?: string,
): Promise<AdjudicationActionResponse> {
  return postJson(
    `/api/adjudications/${encodeURIComponent(adjudicationId)}/action`,
    { action: adjudicationActionKindSchema.parse(action), comments },
    adjudicationActionResponseSchema,
  );
}

// ============================================
// F5 — impact metrics
// ============================================

export function fetchMetrics(): Promise<ImpactMetrics> {
  return getJson("/api/metrics", impactMetricsSchema);
}

// ============================================
// F7 — evidence-feed simulator (director + war-room ticker)
// ============================================

export function fetchSimulatorState(): Promise<SimulatorState> {
  return getJson("/api/simulator", simulatorStateSchema);
}

export function sendSimulatorCommand(command: SimulatorCommand): Promise<SimulatorState> {
  return postJson("/api/simulator", command, simulatorStateSchema);
}
