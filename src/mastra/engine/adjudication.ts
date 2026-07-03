import { appendAuditEvent } from "@/db/access/audit";
import { getAdjudication, upsertAdjudication } from "@/db/access/adjudications";
import { getProperty, updatePropertyStatus } from "@/db/access/properties";
import { insertRiskSignal, listSignalsForProperty } from "@/db/access/signals";
import type {
  Adjudication,
  EscalationReason,
  EvidenceUpdate,
  RiskSignal,
  Severity,
} from "@/db/schema";
import {
  llmVerdictSchema,
  verdictAdjudicator,
  type LlmVerdict,
} from "@/mastra/agents/verdict-adjudicator";
import { generateStructured } from "@/mastra/agents/structured";
import { checkFairness } from "@/mastra/engine/fairness";
import { isLlmConfigured } from "@/mastra/llm";
import { getLogger } from "@/infrastructure/logging/logger";

const logger = getLogger("engine:adjudication");

/**
 * adjudicateEvidence engine (spec §4.1.C, §4.2) with the two HARD-CODED
 * workflow rules. The verdict-adjudicator LLM proposes a verdict and writes
 * the rationale; these rules run AFTER it and override it, whatever it said:
 *
 * 1. EVIDENCE INTEGRITY — a high-severity signal resting on a single source,
 *    OR two sources contradicting each other on a material fact, forces the
 *    composite verdict to red/escalated (`high_severity_single_source` /
 *    `insufficient_or_conflicting_evidence`).
 * 2. FAIRNESS — signals derived from protected-characteristic proxies are
 *    excluded from the verdict and the case is marked
 *    `fairness_guardrail_triggered` (red/escalated for human review).
 */

const SEVERITY_RANK: Record<Severity, number> = { green: 0, amber: 1, red: 2 };

/** Low-confidence "the register was silent/unavailable" placeholders. */
const DATA_GAP_CONFIDENCE = 0.25;

export interface HardRuleOutcome {
  forcedVerdict: Severity | null;
  escalationReason: EscalationReason | null;
  /** Human-readable account of which rule fired and why, for the audit log. */
  ruleRationale: string | null;
  /** Signals excluded from the verdict by the fairness guardrail. */
  fairnessExcluded: RiskSignal[];
  /** Signals the verdict may consider. */
  included: RiskSignal[];
}

/**
 * Apply the two hard-coded rules to a property's evidence base. Pure
 * function — unit-tested directly by the invariant suite.
 */
export function applyHardRules(signals: RiskSignal[], incoming?: EvidenceUpdate): HardRuleOutcome {
  // Rule 2 first: fairness exclusion narrows the evidence the verdict sees.
  const fairnessExcluded = signals.filter((s) => checkFairness(s).blocked);
  const included = signals.filter((s) => !checkFairness(s).blocked);

  if (fairnessExcluded.length > 0) {
    return {
      forcedVerdict: "red",
      escalationReason: "fairness_guardrail_triggered",
      ruleRationale:
        `Fairness guardrail: ${fairnessExcluded.length} signal(s) ` +
        `(${fairnessExcluded.map((s) => s.signalCode).join(", ")}) derive from ` +
        "protected-characteristic proxies. They were excluded from the verdict and the case " +
        "is escalated for human review of the incident.",
      fairnessExcluded,
      included,
    };
  }

  const material = included.filter((s) => s.confidence > DATA_GAP_CONFIDENCE);

  // Rule 1a: two sources conflicting on a material fact — same signal
  // question answered green by one dataset and red by another.
  for (const a of material) {
    const conflicting = material.find(
      (b) =>
        b.signalCode === a.signalCode &&
        b.sourceRef.dataset !== a.sourceRef.dataset &&
        Math.abs(SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]) === 2,
    );
    if (conflicting) {
      return {
        forcedVerdict: "red",
        escalationReason: "insufficient_or_conflicting_evidence",
        ruleRationale:
          `Evidence integrity: sources conflict on ${a.signalCode} — ` +
          `"${a.sourceRef.dataset}" says ${a.severity} while "${conflicting.sourceRef.dataset}" ` +
          `says ${conflicting.severity}. The agent never settles a material evidence conflict alone.`,
        fairnessExcluded,
        included,
      };
    }
  }

  // Rule 1b: high-severity signal resting on a single source — no second
  // dataset corroborates the same signal question.
  const singleSourceRed = material.find(
    (s) =>
      s.severity === "red" &&
      !material.some(
        (other) =>
          other.signalCode === s.signalCode && other.sourceRef.dataset !== s.sourceRef.dataset,
      ),
  );
  if (singleSourceRed) {
    return {
      forcedVerdict: "red",
      escalationReason: "high_severity_single_source",
      ruleRationale:
        `Evidence integrity: red signal ${singleSourceRed.signalCode} rests on the single ` +
        `source "${singleSourceRed.sourceRef.dataset}" (${singleSourceRed.sourceRef.recordId}) ` +
        "with no corroborating dataset. Forced red/escalated pending corroboration.",
      fairnessExcluded,
      included,
    };
  }

  // Material new adverse evidence from monitoring forces a red re-verdict.
  if (incoming && incoming.severity === "red") {
    return {
      forcedVerdict: "red",
      escalationReason: "material_new_adverse_evidence",
      ruleRationale:
        `Monitoring: material adverse evidence "${incoming.headline}" ` +
        `(${incoming.sourceRef.dataset}) arrived after publication. Forced red/escalated.`,
      fairnessExcluded,
      included,
    };
  }

  return {
    forcedVerdict: null,
    escalationReason: null,
    ruleRationale: null,
    fairnessExcluded,
    included,
  };
}

/** Deterministic verdict floor when the LLM is unavailable or too lenient. */
function worstSeverity(signals: RiskSignal[]): Severity {
  return signals.reduce<Severity>(
    (worst, s) =>
      s.confidence > DATA_GAP_CONFIDENCE && SEVERITY_RANK[s.severity] > SEVERITY_RANK[worst]
        ? s.severity
        : worst,
    "green",
  );
}

function deterministicRationale(signals: RiskSignal[], verdict: Severity): string {
  const decisive = signals
    .filter((s) => s.severity === verdict)
    .slice(0, 3)
    .map((s) => `${s.signalCode} (${s.sourceRef.dataset} ${s.sourceRef.recordId})`)
    .join("; ");
  return (
    `Deterministic verdict (no LLM available): worst included sourced severity is ${verdict}` +
    (decisive ? `, driven by ${decisive}.` : ", with no material sourced signal.")
  );
}

async function llmVerdict(
  signals: RiskSignal[],
  incoming?: EvidenceUpdate,
): Promise<LlmVerdict | null> {
  if (!isLlmConfigured()) return null;
  const prompt = [
    "Adjudicate the composite risk verdict for this property.",
    "",
    "SOURCED RISK SIGNALS:",
    JSON.stringify(
      signals.map((s) => ({
        signalCode: s.signalCode,
        severity: s.severity,
        confidence: s.confidence,
        finding: s.finding,
        sourceRef: s.sourceRef,
      })),
      null,
      2,
    ),
    incoming
      ? `\nLATEST INCOMING EVIDENCE:\n${JSON.stringify(
          {
            kind: incoming.kind,
            severity: incoming.severity,
            signalCode: incoming.signalCode,
            headline: incoming.headline,
            detail: incoming.detail,
            sourceRef: incoming.sourceRef,
          },
          null,
          2,
        )}`
      : "",
  ].join("\n");
  const result = await generateStructured(verdictAdjudicator, prompt, llmVerdictSchema, {
    maxSteps: 1,
  });
  return result.ok ? result.value : null;
}

export interface VerdictComputation {
  verdict: Severity;
  escalationReason: EscalationReason | null;
  rationale: string;
  rules: HardRuleOutcome;
}

/**
 * Compute the composite verdict for a set of sourced signals: the LLM
 * proposes, the hard-coded rules dispose. Shared by cluster adjudications
 * and the single-property lookup — one engine, no duplicated logic.
 */
export async function computeVerdict(
  signals: RiskSignal[],
  options: { incoming?: EvidenceUpdate; withLlm?: boolean } = {},
): Promise<VerdictComputation> {
  const { incoming, withLlm = true } = options;
  const rules = applyHardRules(signals, incoming);
  const proposed = withLlm ? await llmVerdict(rules.included, incoming) : null;
  const floor = worstSeverity(rules.included);

  if (rules.forcedVerdict) {
    return {
      verdict: rules.forcedVerdict,
      escalationReason: rules.escalationReason,
      rationale: proposed
        ? `${rules.ruleRationale} LLM assessment (recorded, overridden where different): ${proposed.verdictRationale}`
        : `${rules.ruleRationale} ${deterministicRationale(rules.included, rules.forcedVerdict)}`,
      rules,
    };
  }
  if (proposed) {
    const verdict =
      SEVERITY_RANK[proposed.compositeVerdict] >= SEVERITY_RANK[floor]
        ? proposed.compositeVerdict
        : floor;
    return {
      verdict,
      escalationReason: verdict === "red" ? proposed.escalationReason : null,
      rationale:
        verdict === proposed.compositeVerdict
          ? proposed.verdictRationale
          : `Verdict floored at ${verdict} (worst included sourced severity) over the model's ` +
            `${proposed.compositeVerdict}. Model rationale: ${proposed.verdictRationale}`,
      rules,
    };
  }
  // Deterministic path: a red here is corroborated (rule 1b would have fired
  // otherwise) — escalated for human decision, no forced reason.
  return {
    verdict: floor,
    escalationReason: null,
    rationale: deterministicRationale(rules.included, floor),
    rules,
  };
}

export interface AdjudicationInput {
  adjudicationId: string;
  propertyId: string;
  clusterId: string;
  incoming?: EvidenceUpdate;
  /**
   * Whether the verdict-adjudicator LLM writes the rationale. Bulk initial
   * verdicts over the synthetic cohort stay deterministic; real properties
   * and monitoring re-adjudications use the model.
   */
  withLlm?: boolean;
}

/**
 * Adjudicate one property: LLM proposes, hard rules dispose. Persists the
 * adjudication + property status and writes the audit trail.
 */
export async function adjudicateProperty(input: AdjudicationInput): Promise<Adjudication> {
  const { adjudicationId, propertyId, clusterId, incoming, withLlm = true } = input;
  const property = getProperty(propertyId);
  if (!property) throw new Error(`Property not found: ${propertyId}`);

  // Incoming monitoring evidence becomes a sourced signal on the property —
  // through the same hard gate as everything else.
  if (incoming) {
    const inserted = insertRiskSignal({
      id: `ev-${incoming.id}-${propertyId}`,
      propertyId,
      signalCode: incoming.signalCode,
      dimensionCode: incoming.dimensionCode,
      finding: `${incoming.headline} — ${incoming.detail}`,
      sourceRef: incoming.sourceRef,
      severity: incoming.severity,
      confidence: 0.85,
      rationale: `Monitoring feed update (${incoming.kind}) received after publication.`,
    });
    if (!inserted.ok) {
      logger.warn("Incoming evidence rejected by the evidence gate", {
        updateId: incoming.id,
        issues: inserted.issues,
      });
    }
  }

  const signals = listSignalsForProperty(propertyId);
  const { verdict, escalationReason, rationale, rules } = await computeVerdict(signals, {
    incoming,
    withLlm,
  });

  for (const excluded of rules.fairnessExcluded) {
    appendAuditEvent({
      actor: "agent",
      action: "fairness_guardrail_triggered",
      entityType: "RiskSignal",
      entityId: excluded.id,
      rationale: `Signal ${excluded.signalCode} excluded from the verdict of ${propertyId}: protected-characteristic proxy.`,
      payloadSnapshot: { propertyId, signalCode: excluded.signalCode },
    });
  }

  const now = new Date().toISOString();
  const adjudication = upsertAdjudication({
    id: adjudicationId,
    propertyId,
    clusterId,
    status: verdict === "red" ? "escalated" : "monitoring",
    compositeVerdict: verdict,
    verdictRationale: rationale,
    latestEvidence: incoming ? `${incoming.headline} (${incoming.sourceRef.dataset})` : null,
    escalationReason,
    assessedAt: now,
    lastActivityAt: now,
  });

  updatePropertyStatus(
    propertyId,
    verdict === "red" ? "escalated" : verdict === "amber" ? "flagged" : "cleared",
  );

  appendAuditEvent({
    actor: "agent",
    action: verdict === "red" ? "adjudication_escalated" : "verdict_adjudicated",
    entityType: "Adjudication",
    entityId: adjudicationId,
    rationale,
    payloadSnapshot: {
      propertyId,
      compositeVerdict: verdict,
      escalationReason,
      hardRuleFired: rules.ruleRationale !== null,
      incomingEvidenceId: incoming?.id ?? null,
    },
  });

  return adjudication;
}

export type HumanAdjudicationAction = "confirm_risk" | "request_more_evidence" | "mark_resolved";

/**
 * Apply an expert decision on an escalated (or monitored) case. Red cases
 * are NEVER resolved automatically — this function is only reachable from a
 * human action, requires a justification to resolve a red, and journals the
 * decision under the human actor.
 */
export function applyHumanAdjudication(
  adjudicationId: string,
  action: HumanAdjudicationAction,
  comments: string,
): Adjudication {
  const existing = getAdjudication(adjudicationId);
  if (!existing) throw new Error(`Adjudication not found: ${adjudicationId}`);
  if (action === "mark_resolved" && existing.compositeVerdict === "red" && !comments.trim()) {
    throw new Error("Resolving a red verdict requires a written justification.");
  }

  const now = new Date().toISOString();
  let updated: Adjudication;
  switch (action) {
    case "confirm_risk":
      updated = upsertAdjudication({
        ...existing,
        status: "adjudicated",
        lastActivityAt: now,
      });
      updatePropertyStatus(existing.propertyId, "flagged");
      break;
    case "request_more_evidence":
      updated = upsertAdjudication({
        ...existing,
        status: "monitoring",
        lastActivityAt: now,
      });
      break;
    case "mark_resolved":
      updated = upsertAdjudication({
        ...existing,
        status: "resolved",
        lastActivityAt: now,
      });
      updatePropertyStatus(existing.propertyId, "closed");
      break;
  }

  appendAuditEvent({
    actor: "user:nadia",
    action: `human_adjudication_${action}`,
    entityType: "Adjudication",
    entityId: adjudicationId,
    rationale:
      comments.trim() ||
      `Expert action "${action}" on ${existing.propertyId} (verdict ${existing.compositeVerdict}).`,
    payloadSnapshot: { propertyId: existing.propertyId, action, previousStatus: existing.status },
  });
  return updated;
}
