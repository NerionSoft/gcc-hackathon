"use client";

import { useEffect, useState } from "react";
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
}

/**
 * One load of the three read endpoints the wall needs. Everything flows
 * through `presentation/data/api.ts`, so pointing the wall at the engine
 * worker's live endpoints (or turning this into a poll) touches only the
 * data layer.
 */
export function usePortfolioData(): PortfolioData {
  const [data, setData] = useState<PortfolioData>({
    tiles: null,
    summary: null,
    clusters: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPortfolio(), fetchPortfolioSummary(), fetchClusters()])
      .then(([portfolio, summary, clusters]) => {
        if (cancelled) return;
        setData({ tiles: portfolio.properties, summary, clusters, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setData((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : "Failed to load portfolio",
        }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}
