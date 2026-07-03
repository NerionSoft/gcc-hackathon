"use client";

import { useState } from "react";
import { Gauge, Pause, Play, RotateCcw } from "lucide-react";
import { sendSimulatorCommand } from "@/presentation/data/api";
import type { SimulatorCommand, SimulatorState } from "@/presentation/data/contracts";
import { Button } from "@/presentation/ui/primitives/button";
import { cx } from "@/presentation/ui/cx";

/** Replay speeds offered to the analyst / director. */
const SPEEDS = [
  { label: "1×", intervalMs: 2000 },
  { label: "2×", intervalMs: 1000 },
  { label: "4×", intervalMs: 500 },
] as const;

/**
 * Evidence-feed controls (spec §4.3 / F7): the same simulator the /director
 * panel drives, surfaced here so the war room is demonstrable on its own. Start
 * replays the pre-written open-data updates; each one resumes the campaign's
 * adjudicate-evidence gate and reclassifies a card.
 */
export function FeedControls({
  simulator,
  onChange,
}: {
  simulator: SimulatorState | null;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const running = simulator?.status === "running";

  const send = async (command: SimulatorCommand) => {
    setBusy(true);
    try {
      await sendSimulatorCommand(command);
      onChange();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-(--radius-card) border border-line bg-surface px-3 py-2 shadow-(--shadow-card)">
      <span className="font-mono text-[11px] uppercase tracking-wide text-ink-secondary">
        Evidence feed
      </span>
      <span
        className={cx(
          "inline-flex items-center gap-1 rounded-(--radius-badge) border px-1.5 py-px font-mono text-[11px]",
          running
            ? "border-primary/40 bg-[#EEF1F6] text-primary"
            : "border-line bg-background text-ink-secondary",
        )}
      >
        <span
          aria-hidden
          className={cx("h-1.5 w-1.5 rounded-full", running ? "bg-primary" : "bg-ink-secondary")}
        />
        {simulator ? simulator.status : "—"}
      </span>
      {simulator && (
        <span className="font-mono text-[11px] text-ink-secondary tabular-nums">
          {simulator.cursor}/{simulator.totalUpdates}
        </span>
      )}

      {running ? (
        <Button variant="secondary" onClick={() => void send({ command: "pause" })} disabled={busy}>
          <Pause aria-hidden className="h-3.5 w-3.5" strokeWidth={1.5} />
          Pause
        </Button>
      ) : (
        <Button
          variant="primary"
          onClick={() => void send({ command: "start", intervalMs: 1000 })}
          disabled={busy || simulator?.status === "done"}
          data-testid="start-feed"
        >
          <Play aria-hidden className="h-3.5 w-3.5" strokeWidth={1.5} />
          {simulator?.status === "paused" ? "Resume" : "Start feed"}
        </Button>
      )}

      <span className="inline-flex items-center gap-1 border-l border-line pl-2">
        <Gauge aria-hidden className="h-3.5 w-3.5 text-ink-secondary" strokeWidth={1.5} />
        {SPEEDS.map((speed) => {
          const active = simulator?.intervalMs === speed.intervalMs;
          return (
            <button
              key={speed.label}
              type="button"
              disabled={busy}
              onClick={() => void send({ command: "speed", intervalMs: speed.intervalMs })}
              className={cx(
                "rounded-(--radius-badge) px-1.5 py-px font-mono text-[11px] transition-colors",
                active ? "bg-primary text-white" : "text-primary hover:bg-primary/5",
              )}
            >
              {speed.label}
            </button>
          );
        })}
      </span>

      <Button variant="ghost" onClick={() => void send({ command: "reset" })} disabled={busy}>
        <RotateCcw aria-hidden className="h-3.5 w-3.5" strokeWidth={1.5} />
        Reset
      </Button>
    </div>
  );
}
