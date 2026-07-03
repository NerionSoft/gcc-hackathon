"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PropertyStatus } from "@/db/schema";
import { fetchPortfolio, fetchScanStatus, startScan } from "@/presentation/data/api";
import type { PortfolioTile } from "@/presentation/data/contracts";

export type ScanPhase = "idle" | "running" | "complete";

export interface ScanCounters {
  scanned: number;
  signalsExtracted: number;
  outOfScope: number;
}

export interface CampaignScan {
  phase: ScanPhase;
  counters: ScanCounters;
  /** Resolves a tile's displayed status (real engine status + reveal sweep). */
  statusOf: (tile: PortfolioTile) => PropertyStatus;
  start: () => void;
  reset: () => void;
}

/** Settled statuses: the property has been processed by the scan step. */
const SETTLED: ReadonlySet<PropertyStatus> = new Set<PropertyStatus>([
  "signals_extracted",
  "in_cluster",
  "assessed",
  "verdict_pending_review",
  "cleared",
  "flagged",
  "escalated",
  "closed",
]);

/** Gate the campaign suspends at once scanning + clustering + composing is done. */
const REVIEW_GATE = "await-assessment-review";

/** How wide the "scanning" band ahead of the reveal frontier is (tiles). */
const SCAN_WINDOW_FRAC = 0.06;
/** Reveal easing: min visual sweep ~2.5s even when the engine settles instantly. */
const EASE_STEP = 0.04;
const POLL_MS = 500;
const EASE_MS = 66;

/**
 * Wires the portfolio wall to the REAL engine (phase-5): "Run scan" starts the
 * civic-risk-scan campaign, and the hook polls `scanPortfolio` statuses +
 * cluster progress, reflecting them on the wall. The old client-side
 * simulation is gone — statuses here are the engine's own.
 *
 * A reveal frontier eases across the deterministic wall order so the sweep
 * stays legible even though the synthetic cohort settles in bulk; every tile
 * still resolves to its true persisted status. Real properties the engine
 * could not investigate (no LLM key) honestly stay unscanned.
 *
 * `onComplete` fires once the campaign reaches the review gate so the view can
 * pull the engine's persisted clusters for the condensation.
 */
export function useCampaignScan(
  tiles: PortfolioTile[] | null,
  options: { initialComplete?: boolean; onComplete?: () => void } = {},
): CampaignScan {
  const { initialComplete = false, onComplete } = options;
  const [phase, setPhase] = useState<ScanPhase>(initialComplete ? "complete" : "idle");
  const [reveal, setReveal] = useState(initialComplete ? 1 : 0);
  const [live, setLive] = useState<ReadonlyMap<string, PropertyStatus>>(new Map());
  const [counters, setCounters] = useState<ScanCounters>({
    scanned: 0,
    signalsExtracted: 0,
    outOfScope: 0,
  });

  const order = useMemo(() => {
    if (!tiles) return [] as PortfolioTile[];
    return seededShuffle(tiles, 42);
  }, [tiles]);
  const orderIndex = useMemo(() => {
    const map = new Map<string, number>();
    order.forEach((tile, index) => map.set(tile.id, index));
    return map;
  }, [order]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const easeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Synchronous re-entry guard (pollRef is only set after the async start). */
  const activeRef = useRef(false);
  const targetRef = useRef(initialComplete ? 1 : 0);
  const finalsRef = useRef<ScanCounters>({ scanned: 0, signalsExtracted: 0, outOfScope: 0 });
  const completeRef = useRef(initialComplete);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  /** Guards the "already scanned on load" auto-complete so it fires only once. */
  const settledOnceRef = useRef(initialComplete);

  const stopTimers = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (easeRef.current) clearInterval(easeRef.current);
    pollRef.current = null;
    easeRef.current = null;
  }, []);

  useEffect(() => stopTimers, [stopTimers]);

  // Already-scanned on load (a prior campaign persisted real clusters): jump
  // straight to the settled wall so the reviewer can cluster/inspect without
  // re-running. Fires at most once, never after an explicit start/reset.
  useEffect(() => {
    if (
      initialComplete &&
      !settledOnceRef.current &&
      phase === "idle" &&
      !pollRef.current &&
      tiles
    ) {
      settledOnceRef.current = true;
      completeRef.current = true;
      targetRef.current = 1;
      setReveal(1);
      // Seed the counters from the settled statuses so the context band reads
      // the real totals immediately, not zeros.
      const finals = countFinals(tiles);
      finalsRef.current = finals;
      setCounters(finals);
      setPhase("complete");
    }
  }, [initialComplete, phase, tiles]);

  const reset = useCallback(() => {
    stopTimers();
    activeRef.current = false;
    completeRef.current = false;
    targetRef.current = 0;
    finalsRef.current = { scanned: 0, signalsExtracted: 0, outOfScope: 0 };
    setReveal(0);
    setLive(new Map());
    setCounters({ scanned: 0, signalsExtracted: 0, outOfScope: 0 });
    setPhase("idle");
  }, [stopTimers]);

  const poll = useCallback(async () => {
    const currentTiles = tiles;
    if (!currentTiles) return;
    try {
      const [status, portfolio] = await Promise.all([fetchScanStatus(), fetchPortfolio()]);
      const map = new Map<string, PropertyStatus>();
      let scanned = 0;
      let signals = 0;
      let outOfScope = 0;
      for (const tile of portfolio.properties) {
        map.set(tile.id, tile.status);
        if (tile.status === "out_of_scope") outOfScope += 1;
        else if (SETTLED.has(tile.status)) {
          scanned += 1;
          signals += tile.signalCount;
        }
      }
      setLive(map);
      finalsRef.current = { scanned, signalsExtracted: signals, outOfScope };

      const total = currentTiles.length || 1;
      const processed = scanned + outOfScope;
      const atGate = status.suspendedSteps.includes(REVIEW_GATE);
      // Once the campaign has clustered, the scan is done; reveal completes and
      // any still-unscanned tiles are honestly-skipped (no LLM) properties.
      targetRef.current = atGate ? 1 : Math.min(0.98, processed / total);
      if (atGate) completeRef.current = true;
    } catch {
      // Transient (dev reload, not-yet-created run) — keep polling.
    }
  }, [tiles]);

  const start = useCallback(() => {
    if (!tiles || tiles.length === 0 || activeRef.current) return;
    activeRef.current = true;
    settledOnceRef.current = true;
    completeRef.current = false;
    targetRef.current = 0;
    finalsRef.current = { scanned: 0, signalsExtracted: 0, outOfScope: 0 };
    setReveal(0);
    setCounters({ scanned: 0, signalsExtracted: 0, outOfScope: 0 });
    setPhase("running");
    // Only poll /api/scan/status AFTER the run exists — polling the idle
    // NO_ACTIVE_CAMPAIGN path 500s under `next start` and browsers log every
    // failed fetch as a console error. The ease sweep starts immediately.
    startScan()
      .then(() => {
        void poll();
        pollRef.current = setInterval(() => void poll(), POLL_MS);
      })
      .catch(() => undefined);
    easeRef.current = setInterval(() => {
      setReveal((prev) => {
        const next = Math.min(targetRef.current, prev + EASE_STEP);
        // Ease displayed counters up with the sweep for a count-up feel.
        const f = finalsRef.current;
        setCounters({
          scanned: Math.round(f.scanned * next),
          signalsExtracted: Math.round(f.signalsExtracted * next),
          outOfScope: Math.round(f.outOfScope * next),
        });
        if (completeRef.current && next >= 0.999) {
          stopTimers();
          setCounters(f);
          setPhase("complete");
          onCompleteRef.current?.();
        }
        return next;
      });
    }, EASE_MS);
  }, [tiles, poll, stopTimers]);

  const frontier = Math.floor(reveal * order.length);
  const window = Math.ceil(order.length * SCAN_WINDOW_FRAC);

  const statusOf = useCallback(
    (tile: PortfolioTile): PropertyStatus => {
      if (phase === "idle") return tile.status;
      const idx = orderIndex.get(tile.id) ?? 0;
      if (idx < frontier) {
        // Revealed: show the true persisted status (or the honest fallback
        // while the first poll is still in flight).
        return live.get(tile.id) ?? (tile.signalCount > 0 ? "signals_extracted" : tile.status);
      }
      if (idx < frontier + window && phase === "running") return "scanning";
      return live.get(tile.id) === "out_of_scope" ? "out_of_scope" : "unscanned";
    },
    [phase, orderIndex, frontier, window, live],
  );

  return { phase, counters, statusOf, start, reset };
}

/** Settled scan totals derived from the tiles' own persisted statuses. */
function countFinals(tiles: readonly PortfolioTile[]): ScanCounters {
  let scanned = 0;
  let signalsExtracted = 0;
  let outOfScope = 0;
  for (const tile of tiles) {
    if (tile.status === "out_of_scope") outOfScope += 1;
    else if (SETTLED.has(tile.status)) {
      scanned += 1;
      signalsExtracted += tile.signalCount;
    }
  }
  return { scanned, signalsExtracted, outOfScope };
}

/** mulberry32 — tiny deterministic PRNG so every take of the demo is identical. */
function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
