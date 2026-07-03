"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PropertyStatus } from "@/db/schema";
import type { PortfolioTile } from "@/presentation/data/contracts";

export type ScanPhase = "idle" | "running" | "complete";

export interface ScanCounters {
  scanned: number;
  signalsExtracted: number;
  outOfScope: number;
}

export interface ScanSimulation {
  phase: ScanPhase;
  counters: ScanCounters;
  /** Local status overlay — resolves a tile's displayed status. */
  statusOf: (tile: PortfolioTile) => PropertyStatus;
  start: () => void;
  reset: () => void;
}

/** ~100ms cadence × 2,800 properties in batches of 45 ≈ a 7s sweep across the wall. */
const TICK_MS = 100;
const BATCH_SIZE = 45;
/** Ticks a tile stays in `scanning` before it settles. */
const SCAN_TICKS = 3;

/**
 * LOCAL scan-state progression, standing in until the engine worker's
 * `scanPortfolio` workflow lands (phase brief §2). It never writes to the
 * database: it overlays statuses client-side in a deterministic order so the
 * wall visibly sweeps unscanned → scanning → signals_extracted/out_of_scope.
 * Swap: replace this hook's overlay with polling of `/api/portfolio` (same
 * `statusOf` contract) once the engine mutates real statuses.
 *
 * Settlement mirrors the stored data honestly: tiles with extracted signals
 * settle as `signals_extracted`; tiles without stored signals (the 50 real
 * properties, which only the live engine can investigate) fall back to
 * `out_of_scope` for this simulation.
 */
export function useScanSimulation(tiles: PortfolioTile[] | null): ScanSimulation {
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [overrides, setOverrides] = useState<ReadonlyMap<string, PropertyStatus>>(new Map());
  const [counters, setCounters] = useState<ScanCounters>({
    scanned: 0,
    signalsExtracted: 0,
    outOfScope: 0,
  });

  const orderRef = useRef<PortfolioTile[]>([]);
  const cursorRef = useRef(0);
  const inFlightRef = useRef<Array<{ tile: PortfolioTile; settleAtTick: number }>>([]);
  const tickRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => stopTimer, [stopTimer]);

  const reset = useCallback(() => {
    stopTimer();
    cursorRef.current = 0;
    tickRef.current = 0;
    inFlightRef.current = [];
    setOverrides(new Map());
    setCounters({ scanned: 0, signalsExtracted: 0, outOfScope: 0 });
    setPhase("idle");
  }, [stopTimer]);

  const start = useCallback(() => {
    if (!tiles || tiles.length === 0 || timerRef.current) return;
    // Deterministic sweep order (seeded shuffle) — reproducible for filming.
    orderRef.current = seededShuffle(tiles, 42);
    cursorRef.current = 0;
    tickRef.current = 0;
    inFlightRef.current = [];
    setPhase("running");

    const next = new Map<string, PropertyStatus>();
    let scanned = 0;
    let signalsExtracted = 0;
    let outOfScope = 0;

    timerRef.current = setInterval(() => {
      tickRef.current += 1;
      const order = orderRef.current;

      const batch = order.slice(cursorRef.current, cursorRef.current + BATCH_SIZE);
      cursorRef.current += batch.length;
      for (const tile of batch) {
        next.set(tile.id, "scanning");
        inFlightRef.current.push({ tile, settleAtTick: tickRef.current + SCAN_TICKS });
      }

      while (
        inFlightRef.current.length > 0 &&
        inFlightRef.current[0].settleAtTick <= tickRef.current
      ) {
        const { tile } = inFlightRef.current.shift()!;
        const settled: PropertyStatus = tile.signalCount > 0 ? "signals_extracted" : "out_of_scope";
        next.set(tile.id, settled);
        scanned += 1;
        if (settled === "signals_extracted") signalsExtracted += tile.signalCount;
        else outOfScope += 1;
      }

      setOverrides(new Map(next));
      setCounters({ scanned, signalsExtracted, outOfScope });

      if (cursorRef.current >= order.length && inFlightRef.current.length === 0) {
        stopTimer();
        setPhase("complete");
      }
    }, TICK_MS);
  }, [tiles, stopTimer]);

  const statusOf = useCallback(
    (tile: PortfolioTile) => overrides.get(tile.id) ?? tile.status,
    [overrides],
  );

  return { phase, counters, statusOf, start, reset };
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
