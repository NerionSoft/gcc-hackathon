"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ZodType } from "zod";
import {
  campaignStatusSchema,
  resetResponseSchema,
  scanStartResponseSchema,
  simulatorStateSchema,
  type CampaignStatusDTO,
  type SimulatorStateDTO,
} from "@/presentation/features/director/contracts";

async function postJson<T>(path: string, schema: ZodType<T>, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok && res.status !== 202) throw new Error(`${path} responded ${res.status}`);
  return schema.parse(await res.json());
}

// ---------------------------------------------------------------------------
// Campaign control — start the civic-risk-scan run, poll its gate + counters.
// ---------------------------------------------------------------------------

export interface CampaignControl {
  status: CampaignStatusDTO | null;
  /** true when no run exists yet (a clean slate). */
  idle: boolean;
  busy: boolean;
  error: string | null;
  start: () => Promise<void>;
}

const CAMPAIGN_POLL_MS = 1500;

export function useCampaignControl(): CampaignControl {
  const [status, setStatus] = useState<CampaignStatusDTO | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll a specific run only. The status route errors when no run exists
  // (and browsers log every failed fetch), so the idle console never touches
  // it — it starts polling only once a scan has been kicked off here.
  const poll = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/scan/status?runId=${encodeURIComponent(id)}`, {
        headers: { accept: "application/json" },
      });
      if (!res.ok) return false; // run vanished (e.g. after a reset) — stop quietly
      setStatus(campaignStatusSchema.parse(await res.json()));
      return true;
    } catch {
      return false; // transient network hiccup — keep the last snapshot
    }
  }, []);

  useEffect(() => {
    if (!runId) return;
    let active = true;
    const beat = async () => {
      if (!active) return;
      const ok = await poll(runId);
      if (!ok && active) {
        // The run is gone — drop back to the idle state instead of spamming.
        setRunId(null);
        setStatus(null);
      }
    };
    const kick = setTimeout(() => void beat(), 0);
    const timer = setInterval(() => void beat(), CAMPAIGN_POLL_MS);
    return () => {
      active = false;
      clearTimeout(kick);
      clearInterval(timer);
    };
  }, [runId, poll]);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await postJson("/api/scan/start", scanStartResponseSchema, {});
      setRunId(res.runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, idle: runId === null, busy, error, start };
}

// ---------------------------------------------------------------------------
// Simulator control — evidence-feed replay start / pause / speed / reset.
// ---------------------------------------------------------------------------

export interface SimulatorControl {
  state: SimulatorStateDTO | null;
  error: string | null;
  command: (
    body:
      | { command: "start"; intervalMs?: number }
      | { command: "pause" }
      | { command: "speed"; intervalMs: number }
      | { command: "reset" },
  ) => Promise<void>;
}

const SIM_POLL_MS = 1500;

export function useSimulatorControl(): SimulatorControl {
  const [state, setState] = useState<SimulatorStateDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/simulator", { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`simulator responded ${res.status}`);
      setState(simulatorStateSchema.parse(await res.json()));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    let active = true;
    const kick = setTimeout(() => active && void poll(), 0);
    const timer = setInterval(() => active && void poll(), SIM_POLL_MS);
    return () => {
      active = false;
      clearTimeout(kick);
      clearInterval(timer);
    };
  }, [poll]);

  const command = useCallback<SimulatorControl["command"]>(async (body) => {
    setError(null);
    try {
      setState(await postJson("/api/simulator", simulatorStateSchema, body));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  return { state, error, command };
}

// ---------------------------------------------------------------------------
// Full data reset — re-seed the demo portfolio.
// ---------------------------------------------------------------------------

export interface ResetControl {
  busy: boolean;
  error: string | null;
  result: string | null;
  reset: () => Promise<void>;
}

export function useResetControl(): ResetControl {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reset = useCallback(async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await postJson("/api/director/reset", resetResponseSchema);
      if (mounted.current) {
        setResult(
          `Re-seeded ${res.properties.toLocaleString("en-GB")} properties · ${res.signals.toLocaleString("en-GB")} signals`,
        );
      }
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  return { busy, error, result, reset };
}
