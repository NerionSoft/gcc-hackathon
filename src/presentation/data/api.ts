import type { ZodType } from "zod";
import {
  clustersResponseSchema,
  dossierResponseSchema,
  portfolioResponseSchema,
  portfolioSummarySchema,
  scanRequestResponseSchema,
  searchResponseSchema,
  type ClustersResponse,
  type DossierResponse,
  type PortfolioResponse,
  type PortfolioSummary,
  type ScanRequestResponse,
  type SearchResponse,
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
