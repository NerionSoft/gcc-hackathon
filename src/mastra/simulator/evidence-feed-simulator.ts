import { listAdjudications } from "@/db/access/adjudications";
import { listEvidenceUpdates } from "@/db/access/evidence";
import { listSignalsForProperty } from "@/db/access/signals";
import type { EvidenceUpdate } from "@/db/schema";
import { resumeEvidence, suspendedStepsSafe } from "@/mastra/engine/campaign";
import { getLogger } from "@/infrastructure/logging/logger";

const logger = getLogger("simulator:evidence-feed");

/**
 * evidence-feed-simulator (spec §4.3): once clusters are published, replays
 * the ~40 PRE-WRITTEN seeded feed updates at a configurable pace
 * (deterministic — no live LLM in the loop; the workflow's
 * adjudicate-evidence gate does the adjudication as each update lands).
 *
 * Target selection is deterministic: updates prefer active adjudications on
 * properties that already carry a signal in the update's dimension; ties
 * resolve by replay cursor over the id-sorted candidate list.
 */

export interface SimulatorState {
  status: "idle" | "running" | "paused" | "done";
  cursor: number;
  totalUpdates: number;
  intervalMs: number;
  /** id + headline of the last replayed update, for the UI ticker. */
  lastUpdate: { id: string; headline: string; propertyId: string } | null;
  lastError: string | null;
}

interface SimulatorInternal extends SimulatorState {
  timer: NodeJS.Timeout | null;
  ticking: boolean;
}

const DEFAULT_INTERVAL_MS = 4000;

const globalRef = globalThis as typeof globalThis & { __cpiSimulator?: SimulatorInternal };

function state(): SimulatorInternal {
  globalRef.__cpiSimulator ??= {
    status: "idle",
    cursor: 0,
    totalUpdates: 0,
    intervalMs: DEFAULT_INTERVAL_MS,
    lastUpdate: null,
    lastError: null,
    timer: null,
    ticking: false,
  };
  return globalRef.__cpiSimulator;
}

function publicState(s: SimulatorInternal): SimulatorState {
  return {
    status: s.status,
    cursor: s.cursor,
    totalUpdates: s.totalUpdates,
    intervalMs: s.intervalMs,
    lastUpdate: s.lastUpdate,
    lastError: s.lastError,
  };
}

/** Deterministically pick the adjudication an update lands on. */
export function pickTarget(
  update: EvidenceUpdate,
  cursor: number,
): { adjudicationId: string; propertyId: string } | null {
  const active = listAdjudications()
    .filter((a) => ["queued", "assessing", "monitoring", "evidence_received"].includes(a.status))
    .sort((a, b) => a.propertyId.localeCompare(b.propertyId));
  if (active.length === 0) return null;

  const sameDimension = active.filter((a) =>
    listSignalsForProperty(a.propertyId).some((s) => s.dimensionCode === update.dimensionCode),
  );
  const pool = sameDimension.length > 0 ? sameDimension : active;
  const target = pool[cursor % pool.length];
  return target ? { adjudicationId: target.id, propertyId: target.propertyId } : null;
}

async function tick(): Promise<void> {
  const s = state();
  if (s.status !== "running" || s.ticking) return;
  s.ticking = true;
  try {
    const updates = listEvidenceUpdates();
    s.totalUpdates = updates.length;

    if (s.cursor >= updates.length) {
      // Feed exhausted: close the monitoring loop so the campaign can move
      // to the human-adjudication gate.
      await resumeEvidence({ kind: "close" });
      s.status = "done";
      stopTimer(s);
      logger.info("Evidence feed exhausted; monitoring closed");
      return;
    }

    const gates = await suspendedStepsSafe();
    if (!gates.includes("adjudicate-evidence")) {
      // Campaign not at the monitoring gate (still under review, or busy
      // adjudicating the previous event) — skip this beat, don't advance.
      return;
    }

    const update = updates[s.cursor];
    if (!update) return;
    const target = pickTarget(update, s.cursor);
    if (!target) {
      logger.warn("No active adjudication to receive evidence; pausing simulator");
      s.status = "paused";
      stopTimer(s);
      return;
    }

    s.cursor += 1;
    s.lastUpdate = { id: update.id, headline: update.headline, propertyId: target.propertyId };
    await resumeEvidence({ kind: "evidence", updateId: update.id, propertyId: target.propertyId });
    logger.info("Evidence update replayed", {
      updateId: update.id,
      kind: update.kind,
      propertyId: target.propertyId,
      progress: `${s.cursor}/${updates.length}`,
    });
  } catch (error) {
    s.lastError = error instanceof Error ? error.message : String(error);
    logger.error("Simulator tick failed", { error: s.lastError });
  } finally {
    s.ticking = false;
  }
}

function stopTimer(s: SimulatorInternal): void {
  if (s.timer) clearInterval(s.timer);
  s.timer = null;
}

function startTimer(s: SimulatorInternal): void {
  stopTimer(s);
  s.timer = setInterval(() => void tick(), s.intervalMs);
}

export function getSimulatorState(): SimulatorState {
  const s = state();
  s.totalUpdates = s.totalUpdates || listEvidenceUpdates().length;
  return publicState(s);
}

export function startSimulator(intervalMs?: number): SimulatorState {
  const s = state();
  if (intervalMs !== undefined) s.intervalMs = Math.max(250, intervalMs);
  if (s.status === "done") return publicState(s);
  s.status = "running";
  s.lastError = null;
  startTimer(s);
  void tick();
  return publicState(s);
}

export function pauseSimulator(): SimulatorState {
  const s = state();
  if (s.status === "running") {
    s.status = "paused";
    stopTimer(s);
  }
  return publicState(s);
}

/** Change the replay pace (demo director's speed control). */
export function setSimulatorSpeed(intervalMs: number): SimulatorState {
  const s = state();
  s.intervalMs = Math.max(250, intervalMs);
  if (s.status === "running") startTimer(s);
  return publicState(s);
}

/** Rewind the replay cursor (does not touch the database). */
export function resetSimulator(): SimulatorState {
  const s = state();
  stopTimer(s);
  s.status = "idle";
  s.cursor = 0;
  s.lastUpdate = null;
  s.lastError = null;
  return publicState(s);
}
