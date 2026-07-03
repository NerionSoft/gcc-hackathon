"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  CheckCheck,
  Clapperboard,
  Gauge,
  Pause,
  Play,
  Radio,
  RotateCcw,
  ScanSearch,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "@/presentation/ui/primitives/card";
import { Button } from "@/presentation/ui/primitives/button";
import { MetricStat } from "@/presentation/ui/primitives/metric-stat";
import { NeutralBadge } from "@/presentation/ui/primitives/badge";
import { formatInt } from "@/presentation/ui/format";
import { cx } from "@/presentation/ui/cx";
import {
  useCampaignControl,
  useResetControl,
  useReviewAllControl,
  useSimulatorControl,
} from "@/presentation/features/director/use-director";

const GATE_LABEL: Record<string, string> = {
  "await-assessment-review": "Awaiting assessment review",
  "adjudicate-evidence": "Monitoring — evidence gate open",
  "await-human-adjudication": "Awaiting human adjudication",
};

const SPEEDS = [
  { label: "Slow", intervalMs: 4000 },
  { label: "Normal", intervalMs: 2000 },
  { label: "Fast", intervalMs: 750 },
] as const;

const STAGES = [
  { href: "/", label: "Portfolio wall", note: "Act 1–2 · the wall & condensation" },
  { href: "/clusters", label: "Clusters", note: "Act 3 · review gate" },
  { href: "/adjudication", label: "War room", note: "Act 4 · adjudication" },
  { href: "/audit", label: "Audit log", note: "Provenance ledger" },
] as const;

function Dot({ tone }: { tone: "idle" | "active" | "done" }) {
  const color = tone === "active" ? "#1E8E5A" : tone === "done" ? "#1B2A4A" : "#9B9B94";
  return (
    <span
      aria-hidden
      className={cx("inline-block h-2 w-2 rounded-full", tone === "active" && "animate-pulse")}
      style={{ backgroundColor: color }}
    />
  );
}

function CampaignSection() {
  const { status, idle, busy, error, start } = useCampaignControl();
  const review = useReviewAllControl();
  const running = !idle;
  const gates = status?.suspendedSteps ?? [];
  const atReviewGate = gates.includes("await-assessment-review");
  const byStatus = status?.counts.byStatus ?? {};
  const stat = (key: string) => formatInt(byStatus[key] ?? 0);

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <ScanSearch aria-hidden className="h-4 w-4" strokeWidth={1.5} />
            Portfolio scan
          </span>
        }
        aside={
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-ink-secondary">
            <Dot tone={running ? "active" : "idle"} />
            {status?.status ?? "no run"}
          </span>
        }
      />
      <CardBody className="space-y-3">
        <p className="text-[12px] leading-relaxed text-ink-secondary">
          Runs the <span className="font-mono text-ink">civic-risk-scan</span> campaign: the six
          investigators extract sourced signals, deterministic clustering groups them by risk
          pattern, and the workflow suspends at the human review gate.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <MetricStat label="Extracted" value={stat("signals_extracted")} />
          <MetricStat label="In cluster" value={stat("in_cluster")} />
          <MetricStat label="Out of scope" value={stat("out_of_scope")} />
          <MetricStat label="Escalated" value={stat("escalated")} />
          <MetricStat label="Cleared" value={stat("cleared")} />
          <MetricStat label="Flagged" value={stat("flagged")} />
        </div>
        {gates.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {gates.map((gate) => (
              <NeutralBadge key={gate}>{GATE_LABEL[gate] ?? gate}</NeutralBadge>
            ))}
          </div>
        )}
        {status?.runId && (
          <p className="truncate font-mono text-[11px] text-ink-secondary" title={status.runId}>
            run {status.runId}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => void start()} disabled={busy || running}>
            <Play aria-hidden className="h-3.5 w-3.5" strokeWidth={1.5} />
            {busy ? "Starting…" : running ? "Scan running" : "Start scan"}
          </Button>
          {atReviewGate && (
            <Button
              variant="secondary"
              onClick={() => void review.approveAll()}
              disabled={review.busy}
            >
              <CheckCheck aria-hidden className="h-3.5 w-3.5" strokeWidth={1.5} />
              {review.busy ? "Approving…" : "Approve all pending clusters"}
            </Button>
          )}
        </div>
        {atReviewGate && (
          <p className="text-[11px] leading-relaxed text-ink-secondary">
            Demo fast-forward: approves every pending cluster on the reviewer&apos;s behalf through
            the real review gate (reviewer + timestamp stamped, audit written), so the campaign
            reaches the evidence-monitoring gate. In a real run each cluster is reviewed on its own
            sheet.
          </p>
        )}
        {review.result && <p className="text-[12px] text-severity-green">{review.result}</p>}
        {error && <p className="text-[12px] text-severity-red">{error}</p>}
        {review.error && <p className="text-[12px] text-severity-red">{review.error}</p>}
      </CardBody>
    </Card>
  );
}

function SimulatorSection() {
  const { state, error, command } = useSimulatorControl();
  const status = state?.status ?? "idle";
  const running = status === "running";
  const progress =
    state && state.totalUpdates > 0 ? Math.round((state.cursor / state.totalUpdates) * 100) : 0;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Radio aria-hidden className="h-4 w-4" strokeWidth={1.5} />
            Evidence-feed simulator
          </span>
        }
        aside={
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-ink-secondary">
            <Dot tone={running ? "active" : status === "done" ? "done" : "idle"} />
            {status}
          </span>
        }
      />
      <CardBody className="space-y-3">
        <p className="text-[12px] leading-relaxed text-ink-secondary">
          Replays the pre-written open-data updates onto published adjudications (deterministic — no
          live LLM loop). Only advances while the campaign is at its monitoring gate.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <MetricStat label="Replayed" value={formatInt(state?.cursor ?? 0)} />
          <MetricStat label="Total" value={formatInt(state?.totalUpdates ?? 0)} />
          <MetricStat label="Progress" value={`${progress}%`} />
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-background">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        {state?.lastUpdate && (
          <p className="truncate text-[12px] text-ink" title={state.lastUpdate.headline}>
            <Activity
              aria-hidden
              className="mr-1 inline h-3 w-3 text-ink-secondary"
              strokeWidth={1.5}
            />
            {state.lastUpdate.headline}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {running ? (
            <Button variant="secondary" onClick={() => void command({ command: "pause" })}>
              <Pause aria-hidden className="h-3.5 w-3.5" strokeWidth={1.5} />
              Pause
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => void command({ command: "start" })}
              disabled={status === "done"}
            >
              <Play aria-hidden className="h-3.5 w-3.5" strokeWidth={1.5} />
              {status === "paused" ? "Resume" : "Start"}
            </Button>
          )}
          <Button variant="ghost" onClick={() => void command({ command: "reset" })}>
            <RotateCcw aria-hidden className="h-3.5 w-3.5" strokeWidth={1.5} />
            Rewind
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <Gauge aria-hidden className="h-3.5 w-3.5 text-ink-secondary" strokeWidth={1.5} />
          {SPEEDS.map((speed) => {
            const active = state?.intervalMs === speed.intervalMs;
            return (
              <Button
                key={speed.label}
                variant={active ? "primary" : "secondary"}
                onClick={() => void command({ command: "speed", intervalMs: speed.intervalMs })}
                className="px-2 py-1"
              >
                {speed.label}
              </Button>
            );
          })}
          <span className="ml-1 font-mono text-[11px] text-ink-secondary">
            {formatInt(state?.intervalMs ?? 0)}ms
          </span>
        </div>
        {error && <p className="text-[12px] text-severity-red">{error}</p>}
      </CardBody>
    </Card>
  );
}

function ResetSection() {
  const { busy, error, result, reset } = useResetControl();
  const [armed, setArmed] = useState(false);

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <RotateCcw aria-hidden className="h-4 w-4" strokeWidth={1.5} />
            Full data reset
          </span>
        }
      />
      <CardBody className="space-y-3">
        <p className="text-[12px] leading-relaxed text-ink-secondary">
          Rebuilds the database from scratch through the same deterministic seed pipeline as{" "}
          <span className="font-mono text-ink">pnpm seed</span> — same 50 real + 2,750 synthetic
          properties every time. Stops the simulator and forgets the active run. Returns the demo to
          Act 1.
        </p>
        {!armed ? (
          <Button variant="secondary" onClick={() => setArmed(true)} disabled={busy}>
            Reset &amp; re-seed…
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => void reset()} disabled={busy}>
              {busy ? "Re-seeding…" : "Confirm reset"}
            </Button>
            <Button variant="ghost" onClick={() => setArmed(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        )}
        {result && <p className="text-[12px] text-severity-green">{result}</p>}
        {error && <p className="text-[12px] text-severity-red">{error}</p>}
      </CardBody>
    </Card>
  );
}

function StageSection() {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Clapperboard aria-hidden className="h-4 w-4" strokeWidth={1.5} />
            Stage cuts
          </span>
        }
      />
      <CardBody className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {STAGES.map((stage) => (
          <Link
            key={stage.href}
            href={stage.href}
            className="group flex items-center justify-between gap-2 rounded-(--radius-badge) border border-line bg-background px-3 py-2 transition-colors hover:border-primary/40"
          >
            <span>
              <span className="block text-[13px] font-medium text-primary">{stage.label}</span>
              <span className="block text-[11px] text-ink-secondary">{stage.note}</span>
            </span>
            <ArrowUpRight
              aria-hidden
              className="h-4 w-4 shrink-0 text-ink-secondary transition-colors group-hover:text-primary"
              strokeWidth={1.5}
            />
          </Link>
        ))}
      </CardBody>
    </Card>
  );
}

export function DirectorConsole() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 py-2">
      <div>
        <h1 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-primary">
          <Clapperboard aria-hidden className="h-4 w-4" strokeWidth={1.5} />
          Director · demo control room
        </h1>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-secondary">
          The filming console — not linked in the nav. Every control drives the real engine routes.
          Real: the six investigators, connectors, and the 50 real properties with authentic risks.
          Simulated: portfolio scale and the replayed evidence feed.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CampaignSection />
        <SimulatorSection />
        <ResetSection />
        <StageSection />
      </div>
    </div>
  );
}
