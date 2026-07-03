"use client";

import { Combine, Loader2, Play, RotateCcw } from "lucide-react";
import type { PortfolioSummary } from "@/presentation/data/contracts";
import type {
  ScanCounters,
  ScanPhase,
} from "@/presentation/features/portfolio/use-scan-simulation";
import { NeutralBadge } from "@/presentation/ui/primitives/badge";
import { Button } from "@/presentation/ui/primitives/button";
import { MetricStat } from "@/presentation/ui/primitives/metric-stat";
import { formatGBPCompact, formatInt, formatTimestamp } from "@/presentation/ui/format";

/**
 * F1 context band: framework in force, data freshness, capital under review,
 * plus the live scan counters and the two campaign actions.
 */
export function ContextBand({
  summary,
  counters,
  phase,
  condensed,
  onRunScan,
  onCluster,
  onReset,
}: {
  summary: PortfolioSummary;
  counters: ScanCounters;
  phase: ScanPhase;
  /** True once the wall has condensed into cluster cards. */
  condensed: boolean;
  onRunScan: () => void;
  onCluster: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-(--radius-card) border border-line bg-surface px-4 py-3 shadow-(--shadow-card)">
      <div className="flex min-w-0 flex-col gap-1">
        <NeutralBadge className="w-fit">
          {summary.framework.name} — {summary.framework.dimensionCount} dimensions
        </NeutralBadge>
        <span className="font-mono text-[11px] text-ink-secondary">
          sources refreshed:{" "}
          {summary.sourcesRefreshedAt ? formatTimestamp(summary.sourcesRefreshedAt) : "—"}
        </span>
      </div>

      <MetricStat
        label="Capital under review"
        value={formatGBPCompact(summary.capitalUnderReview)}
        hint={`${formatInt(summary.totalProperties)} properties · 6 local authorities`}
      />

      <div className="flex items-center gap-6 border-l border-line pl-6">
        <MetricStat label="Scanned" value={formatInt(counters.scanned)} />
        <MetricStat label="Signals extracted" value={formatInt(counters.signalsExtracted)} />
        <MetricStat label="Out of scope" value={formatInt(counters.outOfScope)} />
      </div>

      <div className="ml-auto flex items-center gap-2">
        {phase === "idle" && (
          <Button variant="primary" onClick={onRunScan}>
            <Play aria-hidden className="h-3.5 w-3.5" strokeWidth={1.5} />
            Run portfolio scan
          </Button>
        )}
        {phase === "running" && (
          <Button variant="primary" disabled>
            <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
            Scanning…
          </Button>
        )}
        {phase === "complete" && !condensed && (
          <Button variant="primary" onClick={onCluster}>
            <Combine aria-hidden className="h-3.5 w-3.5" strokeWidth={1.5} />
            Cluster by risk pattern
          </Button>
        )}
        {phase !== "idle" && (
          <Button variant="ghost" onClick={onReset} title="Reset the demo scan">
            <RotateCcw aria-hidden className="h-3.5 w-3.5" strokeWidth={1.5} />
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}
