"use client";

import { useEffect, useState } from "react";
import { animate } from "framer-motion";
import type { ClusterCard as ClusterCardData } from "@/presentation/data/contracts";
import { SEVERITY_META } from "@/presentation/ui/severity";
import { SeverityBadge } from "@/presentation/ui/primitives/badge";
import { formatInt } from "@/presentation/ui/format";
import { cx } from "@/presentation/ui/cx";

/**
 * One risk-cluster card — the condensation target. Rendered by the animated
 * overlay, the settled clusters grid, and the /clusters route.
 */
export function ClusterCardFace({
  cluster,
  count,
  className,
}: {
  cluster: ClusterCardData;
  /** Displayed member count — the overlay ticks this up during the flight. */
  count: number;
  className?: string;
}) {
  const meta = cluster.dominantSeverity ? SEVERITY_META[cluster.dominantSeverity] : null;
  return (
    <div
      className={cx(
        "flex h-full flex-col overflow-hidden rounded-(--radius-card) border border-line bg-surface px-3.5 py-3 shadow-(--shadow-card)",
        className,
      )}
      style={{ borderTop: `3px solid ${meta ? meta.color : "var(--border)"}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <h3
          className="min-w-0 truncate text-[13px] font-semibold leading-tight text-ink"
          title={cluster.name}
        >
          {cluster.name}
        </h3>
        {cluster.dominantSeverity && <SeverityBadge severity={cluster.dominantSeverity} />}
      </div>
      <div
        className="mt-0.5 truncate font-mono text-[10px] text-ink-secondary"
        title={cluster.pattern}
      >
        {cluster.pattern}
      </div>
      <div className="mt-auto flex items-end justify-between gap-2 pt-2">
        <p className="line-clamp-2 min-w-0 text-[11px] leading-snug text-ink-secondary">
          {cluster.groupingRationale}
        </p>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-xl font-medium leading-none text-primary tabular-nums">
            {formatInt(count)}
          </span>
          <span className="block text-[10px] uppercase tracking-wide text-ink-secondary">
            properties
          </span>
        </span>
      </div>
    </div>
  );
}

/** Count that ticks 0 → target — the counters carry the mass the tiles can't. */
export function useTickingCount(target: number, delay: number, duration: number): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const controls = animate(0, target, {
      delay,
      duration,
      ease: [0.3, 0.6, 0.2, 1],
      onUpdate: (v) => setValue(Math.round(v)),
    });
    return () => controls.stop();
  }, [target, delay, duration]);
  return value;
}
