"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchClusters, fetchPortfolio, fetchPortfolioSummary } from "@/presentation/data/api";
import type {
  ClustersResponse,
  PortfolioSummary,
  PortfolioTile,
} from "@/presentation/data/contracts";

interface PortfolioData {
  tiles: PortfolioTile[] | null;
  summary: PortfolioSummary | null;
  clusters: ClustersResponse | null;
  error: string | null;
  /** Re-pull the engine's persisted clusters (after the scan/cluster step). */
  refetchClusters: () => Promise<void>;
}

/**
 * One load of the three read endpoints the wall needs. Everything flows
 * through `presentation/data/api.ts`. `refetchClusters` lets the view swap the
 * deterministic signature preview for the engine's real persisted clusters
 * once the campaign has clustered.
 */
export function usePortfolioData(): PortfolioData {
  const [tiles, setTiles] = useState<PortfolioTile[] | null>(null);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [clusters, setClusters] = useState<ClustersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetchClusters = useCallback(async () => {
    const next = await fetchClusters();
    setClusters(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPortfolio(), fetchPortfolioSummary(), fetchClusters()])
      .then(([portfolio, portfolioSummary, clustersResponse]) => {
        if (cancelled) return;
        setTiles(portfolio.properties);
        setSummary(portfolioSummary);
        setClusters(clustersResponse);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load portfolio");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { tiles, summary, clusters, error, refetchClusters };
}
