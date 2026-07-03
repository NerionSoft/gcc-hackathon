import { randomUUID } from "node:crypto";
import { CIVIC_RISK_SCAN_WORKFLOW, getMastra } from "@/mastra";
import type {
  EvidenceEvent,
  HumanDecision,
  ReviewDecision,
} from "@/mastra/workflows/civic-risk-scan";
import { DomainError } from "@/shared/errors/domain-error";
import { getLogger } from "@/infrastructure/logging/logger";

const logger = getLogger("engine:campaign");

/**
 * Campaign-run lifecycle: one active civic-risk-scan run at a time. The run
 * executes in the background; API routes drive it through resume() at its
 * suspend gates. The runId survives dev-server reloads via Mastra storage.
 */

export class NoActiveCampaignError extends DomainError {
  constructor() {
    super("NO_ACTIVE_CAMPAIGN", "No active civic-risk-scan campaign run was found.");
  }
}

export class CampaignNotAtGateError extends DomainError {
  constructor(step: string, actual: string[]) {
    super(
      "CAMPAIGN_NOT_AT_GATE",
      `The campaign is not waiting at "${step}" (currently suspended at: ${
        actual.length > 0 ? actual.join(", ") : "none — it is executing"
      }). Retry when the run reaches that gate.`,
    );
  }
}

const globalRef = globalThis as typeof globalThis & { __cpiActiveRunId?: string };

function workflow() {
  return getMastra().getWorkflow(CIVIC_RISK_SCAN_WORKFLOW);
}

export interface CampaignStatus {
  runId: string;
  status: string;
  /** Step ids currently suspended (empty while executing). */
  suspendedSteps: string[];
  /** The suspend payloads keyed by step id (review queue, escalated ids…). */
  suspendPayloads: Record<string, unknown>;
}

/** Start a new campaign run in the background and return its id. */
export async function startCampaign(input: {
  propertyIds?: string[];
  minClusterSize?: number;
}): Promise<string> {
  const runId = `cpi-${randomUUID()}`;
  const run = await workflow().createRun({ runId });
  globalRef.__cpiActiveRunId = runId;
  // Fire and forget: the run executes until its first suspend gate; API
  // routes poll status and resume it. Failures are logged, never swallowed.
  void run
    .start({ inputData: input })
    .then((result) => logger.info("Campaign run settled", { runId, status: result.status }))
    .catch((error: unknown) =>
      logger.error("Campaign run crashed", {
        runId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  return runId;
}

/** Forget the active run pointer (F7 director reset — a fresh scan starts clean). */
export function clearActiveCampaign(): void {
  globalRef.__cpiActiveRunId = undefined;
}

/** The most recent run's id (in-memory first, storage as fallback). */
export async function getActiveRunId(): Promise<string | undefined> {
  if (globalRef.__cpiActiveRunId) return globalRef.__cpiActiveRunId;
  const { runs } = await workflow().listWorkflowRuns({ perPage: 1, page: 0 });
  const runId = runs[0]?.runId;
  if (runId) globalRef.__cpiActiveRunId = runId;
  return runId;
}

export async function getCampaignStatus(runId?: string): Promise<CampaignStatus> {
  const id = runId ?? (await getActiveRunId());
  if (!id) throw new NoActiveCampaignError();
  const state = await workflow().getWorkflowRunById(id);
  if (!state) throw new NoActiveCampaignError();

  const suspendedSteps = Object.keys(state.suspendedPaths ?? {});
  const suspendPayloads: Record<string, unknown> = {};
  for (const stepId of suspendedSteps) {
    const raw = state.steps?.[stepId];
    const step = Array.isArray(raw) ? raw[raw.length - 1] : raw;
    suspendPayloads[stepId] =
      (step as { suspendPayload?: unknown } | undefined)?.suspendPayload ?? null;
  }
  return { runId: id, status: state.status, suspendedSteps, suspendPayloads };
}

async function resumeAtGate<T>(step: string, resumeData: T): Promise<CampaignStatus> {
  const runId = await getActiveRunId();
  if (!runId) throw new NoActiveCampaignError();
  const status = await getCampaignStatus(runId);
  if (!status.suspendedSteps.includes(step)) {
    throw new CampaignNotAtGateError(step, status.suspendedSteps);
  }
  const run = await workflow().createRun({ runId });
  await run.resume({ step, resumeData });
  return getCampaignStatus(runId);
}

/** F3 — approve / request changes on a cluster assessment. */
export function resumeAssessmentReview(decision: ReviewDecision): Promise<CampaignStatus> {
  return resumeAtGate("await-assessment-review", decision);
}

/** §4.3 — the simulator injects one evidence update (or closes the feed). */
export function resumeEvidence(event: EvidenceEvent): Promise<CampaignStatus> {
  return resumeAtGate("adjudicate-evidence", event);
}

/** F4 — expert decision on an escalated case, via the workflow gate. */
export function resumeHumanAdjudication(decision: HumanDecision): Promise<CampaignStatus> {
  return resumeAtGate("await-human-adjudication", decision);
}

/** Which gate (if any) the campaign is suspended at right now. */
export async function suspendedStepsSafe(): Promise<string[]> {
  try {
    return (await getCampaignStatus()).suspendedSteps;
  } catch {
    return [];
  }
}
