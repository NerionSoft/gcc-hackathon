"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAdjudications, fetchSimulatorState } from "@/presentation/data/api";
import type { AdjudicationBoardItem, SimulatorState } from "@/presentation/data/contracts";

export interface WarRoomData {
  items: AdjudicationBoardItem[] | null;
  atHumanGate: boolean;
  simulator: SimulatorState | null;
  /** Adjudication ids whose evidence changed within the last poll — used to
   *  flash the card as it reclassifies. */
  recentlyUpdated: ReadonlySet<string>;
  error: string | null;
  refresh: () => Promise<void>;
}

const POLL_MS = 1500;
const FLASH_MS = 2600;

/**
 * F4 — the war room's live feed. Polls the adjudication board and the
 * simulator state, and flags any adjudication whose activity timestamp advanced
 * since the previous poll so the board can animate the reclassification when
 * the evidence-feed simulator injects an update.
 */
export function useWarRoom(): WarRoomData {
  const [items, setItems] = useState<AdjudicationBoardItem[] | null>(null);
  const [atHumanGate, setAtHumanGate] = useState(false);
  const [simulator, setSimulator] = useState<SimulatorState | null>(null);
  const [recentlyUpdated, setRecentlyUpdated] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const prevActivity = useRef<Map<string, string>>(new Map());
  const flashTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const markFlash = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setRecentlyUpdated((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    for (const id of ids) {
      const existing = flashTimers.current.get(id);
      if (existing) clearTimeout(existing);
      flashTimers.current.set(
        id,
        setTimeout(() => {
          setRecentlyUpdated((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          flashTimers.current.delete(id);
        }, FLASH_MS),
      );
    }
  }, []);

  const refresh = useCallback(() => {
    return Promise.all([fetchAdjudications(), fetchSimulatorState()])
      .then(([board, sim]) => {
        const changed: string[] = [];
        const first = prevActivity.current.size === 0;
        for (const item of board.adjudications) {
          const prev = prevActivity.current.get(item.id);
          if (!first && prev !== undefined && prev !== item.lastActivityAt) changed.push(item.id);
          prevActivity.current.set(item.id, item.lastActivityAt);
        }
        setItems(board.adjudications);
        setAtHumanGate(board.atHumanGate);
        setSimulator(sim);
        setError(null);
        markFlash(changed);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load the war room"),
      );
  }, [markFlash]);

  useEffect(() => {
    const timer = setInterval(() => void refresh(), POLL_MS);
    const timers = flashTimers.current;
    void refresh();
    return () => {
      clearInterval(timer);
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, [refresh]);

  return { items, atHumanGate, simulator, recentlyUpdated, error, refresh };
}
