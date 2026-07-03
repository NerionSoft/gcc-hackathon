"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";
import { fetchMetrics } from "@/presentation/data/api";
import type { ImpactMetrics } from "@/presentation/data/contracts";
import { formatGBPCompact, formatInt } from "@/presentation/ui/format";

/** How often the banner re-pulls impact metrics (live during the simulation). */
const POLL_MS = 2500;

/**
 * F5 — the permanent live impact banner. Subscribes (by polling) to the same
 * engine state the war room watches, so as the evidence feed reclassifies
 * cases the figures move: properties assessed, analyst-time saved, capital
 * screened, share escalated to a human, hidden risks surfaced, and sourced
 * citations. Colour stays neutral — colour carries severity only (spec §6).
 */
export function ImpactBanner() {
  const [metrics, setMetrics] = useState<ImpactMetrics | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = () =>
      fetchMetrics()
        .then((m) => {
          if (!cancelled) setMetrics(m);
        })
        .catch(() => undefined);
    void tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="border-b border-line bg-background">
      <div className="mx-auto flex max-w-450 items-stretch gap-0 overflow-x-auto px-4">
        <Metric
          label="Assessed"
          value={metrics ? formatInt(metrics.propertiesAssessed) : "—"}
          suffix={metrics ? ` / ${formatInt(metrics.propertiesTotal)}` : ""}
          animateValue={metrics?.propertiesAssessed}
          format={formatInt}
        />
        <Metric
          label="Analyst hours saved"
          value={metrics ? formatInt(metrics.analystHoursSaved) : "—"}
          animateValue={metrics?.analystHoursSaved}
          format={formatInt}
          hint="~7h manual due diligence / site"
        />
        <Metric
          label="Capital screened"
          value={metrics ? formatGBPCompact(metrics.capitalScreenedGbp) : "—"}
          animateValue={metrics?.capitalScreenedGbp}
          format={formatGBPCompact}
        />
        <Metric
          label="Escalated to human"
          value={metrics ? `${metrics.escalatedPct.toFixed(1)}%` : "—"}
          hint={metrics ? `${formatInt(metrics.escalatedCount)} cases` : undefined}
        />
        <Metric
          label="Hidden risks surfaced"
          value={metrics ? formatInt(metrics.hiddenRisksRevealed) : "—"}
          animateValue={metrics?.hiddenRisksRevealed}
          format={formatInt}
          hint="amber/red, absent from listings"
        />
        <Metric
          label="Sources cited"
          value={metrics ? formatInt(metrics.sourcesCited) : "—"}
          animateValue={metrics?.sourcesCited}
          format={formatInt}
          hint={metrics ? `${formatInt(metrics.distinctDatasets)} open datasets` : undefined}
          last
        />
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  suffix,
  hint,
  animateValue,
  format,
  last = false,
}: {
  label: string;
  value: string;
  suffix?: string;
  hint?: string;
  animateValue?: number;
  format?: (n: number) => string;
  last?: boolean;
}) {
  const animated = useAnimatedNumber(animateValue);
  const display = animateValue !== undefined && format ? format(animated) : value;
  return (
    <div
      className={`flex min-w-0 shrink-0 flex-col justify-center py-1.5 pr-6 ${last ? "" : "border-r border-line"} pl-0 first:pl-0 [&:not(:first-child)]:pl-6`}
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-ink-secondary">
        {label}
      </span>
      <span className="font-mono text-[15px] font-medium leading-tight text-primary tabular-nums">
        {display}
        {suffix && <span className="text-[12px] text-ink-secondary">{suffix}</span>}
      </span>
      {hint && <span className="truncate text-[10px] text-ink-secondary">{hint}</span>}
    </div>
  );
}

/** Ease a displayed number toward its latest target so live updates tick. */
function useAnimatedNumber(target: number | undefined): number {
  const [value, setValue] = useState(target ?? 0);
  const current = useRef(target ?? 0);
  useEffect(() => {
    if (target === undefined) return;
    const from = current.current;
    if (from === target) return;
    const controls = animate(from, target, {
      duration: 0.7,
      ease: [0.3, 0.6, 0.2, 1],
      onUpdate: (v) => {
        current.current = v;
        setValue(v);
      },
    });
    return () => controls.stop();
  }, [target]);
  return value;
}
