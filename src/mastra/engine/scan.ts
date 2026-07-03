import { randomUUID } from "node:crypto";
import { appendAuditEvent } from "@/db/access/audit";
import { getFrameworkByName } from "@/db/access/frameworks";
import { getProperty, listProperties, updatePropertyStatus } from "@/db/access/properties";
import { insertRiskSignal, listSignalsForProperty } from "@/db/access/signals";
import type { DimensionCode, Property, RiskFramework, RiskSignal } from "@/db/schema";
import { INVESTIGATORS, investigatorOutputSchema } from "@/mastra/agents/investigators";
import { generateStructured } from "@/mastra/agents/structured";
import { checkFairness } from "@/mastra/engine/fairness";
import { isLlmConfigured } from "@/mastra/llm";
import { getLogger } from "@/infrastructure/logging/logger";

const logger = getLogger("engine:scan");

export const FRAMEWORK_NAME = "Civic Property Risk v1";
const DIMENSIONS: readonly DimensionCode[] = [
  "BUILDING",
  "UNIT",
  "BLOCK",
  "PEOPLE",
  "LAND",
  "MARKET",
];

/** How many properties are investigated concurrently (real cohort). */
const REAL_BATCH_SIZE = 5;
/** Synthetic replays are cheap status flips — bigger batches, one audit each. */
const SYNTHETIC_BATCH_SIZE = 500;

export interface ScanSummary {
  scanned: number;
  outOfScope: number;
  /** Real properties skipped because no LLM is configured. */
  skippedLlmUnavailable: number;
  signalsAccepted: number;
  signalsRejected: number;
  fairnessBlocked: number;
  investigationFailures: number;
}

export function requireFramework(): RiskFramework {
  const framework = getFrameworkByName(FRAMEWORK_NAME);
  if (!framework) {
    throw new Error(`Risk framework "${FRAMEWORK_NAME}" is not seeded — run \`pnpm seed\`.`);
  }
  return framework;
}

/**
 * Scope rule (deterministic, spec statuses): the v1 framework assesses BUILT
 * assets. Bare land parcels lack the building/unit evidence layers and fall
 * out of scope of this framework version.
 */
export function isOutOfScope(property: Property): boolean {
  return property.propertyType === "land";
}

function investigationPrompt(
  property: Property,
  dimension: DimensionCode,
  framework: RiskFramework,
): string {
  const defs = framework.dimensions.find((d) => d.code === dimension)?.signals ?? [];
  return [
    `Investigate the ${dimension} risk layer of this property.`,
    "",
    `PROPERTY:\n${JSON.stringify(
      {
        id: property.id,
        address: property.address,
        postcode: property.postcode,
        localAuthority: property.localAuthority,
        lat: property.lat,
        lng: property.lng,
        propertyType: property.propertyType,
        tenure: property.tenure,
        value: property.value,
        intendedUse: property.intendedUse,
      },
      null,
      2,
    )}`,
    "",
    `RISK SIGNAL DEFINITIONS for ${dimension} (emit signals against these codes only):`,
    JSON.stringify(
      defs.map((d) => ({
        code: d.code,
        title: d.title,
        description: d.description,
        source: d.source,
        method: d.method,
        severityRubric: d.severityRubric,
      })),
      null,
      2,
    ),
    "",
    `First call the gather-evidence tool with propertyId "${property.id}", then emit your sourced signals.`,
  ].join("\n");
}

interface DimensionScanResult {
  accepted: RiskSignal[];
  rejected: number;
  fairnessBlocked: number;
  failed: boolean;
}

/** Run one investigator on one property and persist through the hard gate. */
async function investigateDimension(
  property: Property,
  dimension: DimensionCode,
  framework: RiskFramework,
): Promise<DimensionScanResult> {
  const agent = INVESTIGATORS[dimension];
  const result = await generateStructured(
    agent,
    investigationPrompt(property, dimension, framework),
    investigatorOutputSchema,
  );

  if (!result.ok) {
    // Graceful fallback: the failure is journalled, the scan continues.
    appendAuditEvent({
      actor: "agent",
      action: "investigation_failed",
      entityType: "Property",
      entityId: property.id,
      rationale:
        `${agent.name} produced no valid ${dimension} signals after 1 retry ` +
        `(${result.detail}). Extraction logged as failed; no unsourced finding was recorded.`,
    });
    return { accepted: [], rejected: 0, fairnessBlocked: 0, failed: true };
  }

  const scan: DimensionScanResult = {
    accepted: [],
    rejected: 0,
    fairnessBlocked: 0,
    failed: false,
  };
  for (const candidate of result.value.signals) {
    // Fairness guardrail — blocked BEFORE persistence, audited (spec §1).
    const fairness = checkFairness(candidate);
    if (fairness.blocked) {
      scan.fairnessBlocked += 1;
      appendAuditEvent({
        actor: "agent",
        action: "fairness_guardrail_triggered",
        entityType: "RiskSignal",
        entityId: property.id,
        rationale:
          `Candidate ${candidate.signalCode} signal was blocked before persistence: it ` +
          `references protected-characteristic proxies (${fairness.matches.join(", ")}). ` +
          "Risk is measured on the asset and its context, never on the people living there.",
        payloadSnapshot: candidate,
      });
      continue;
    }

    // Cardinal rule — "no evidence, no finding" — enforced by the db gate,
    // which also journals every rejection as a failed extraction.
    const inserted = insertRiskSignal({
      ...candidate,
      id: randomUUID(),
      propertyId: property.id,
      dimensionCode: dimension,
    });
    if (inserted.ok) scan.accepted.push(inserted.signal);
    else scan.rejected += 1;
  }
  return scan;
}

/** Investigate one REAL property across all 6 dimensions (specialists in parallel). */
export async function investigateProperty(
  property: Property,
  framework: RiskFramework,
): Promise<Omit<ScanSummary, "scanned" | "outOfScope" | "skippedLlmUnavailable">> {
  const results = await Promise.all(
    DIMENSIONS.map((dimension) => investigateDimension(property, dimension, framework)),
  );
  const accepted = results.flatMap((r) => r.accepted);
  appendAuditEvent({
    actor: "agent",
    action: "property_investigated",
    entityType: "Property",
    entityId: property.id,
    rationale:
      `Six investigators completed on live open data: ${accepted.length} sourced signals accepted, ` +
      `${results.reduce((n, r) => n + r.rejected, 0)} rejected by the evidence gate, ` +
      `${results.filter((r) => r.failed).length} dimension(s) failed extraction.`,
    payloadSnapshot: {
      signalCodes: accepted.map((s) => `${s.signalCode}:${s.severity}`),
    },
  });
  return {
    signalsAccepted: accepted.length,
    signalsRejected: results.reduce((n, r) => n + r.rejected, 0),
    fairnessBlocked: results.reduce((n, r) => n + r.fairnessBlocked, 0),
    investigationFailures: results.filter((r) => r.failed).length,
  };
}

/**
 * scanPortfolio engine (spec §4.2, first step). One property is a portfolio
 * of one — the F0 single-property lookup calls this with a list of 1.
 *
 * - Synthetic properties replay their pre-computed seeded signals (no LLM).
 * - Real properties go through the six live investigators in parallel batches.
 * - Without an LLM key the engine degrades gracefully: real properties are
 *   skipped (left unscanned) with an audit event, synthetic replay continues.
 */
export async function scanProperties(propertyIds?: string[]): Promise<ScanSummary> {
  const framework = requireFramework();
  const targets = (
    propertyIds
      ? propertyIds.map((id) => {
          const p = getProperty(id);
          if (!p) throw new Error(`Property not found: ${id}`);
          return p;
        })
      : listProperties({ status: "unscanned" })
  ).filter((p) => p.status === "unscanned");

  const summary: ScanSummary = {
    scanned: 0,
    outOfScope: 0,
    skippedLlmUnavailable: 0,
    signalsAccepted: 0,
    signalsRejected: 0,
    fairnessBlocked: 0,
    investigationFailures: 0,
  };

  // 1. Scope gate.
  const inScope: Property[] = [];
  for (const property of targets) {
    if (isOutOfScope(property)) {
      updatePropertyStatus(property.id, "out_of_scope");
      summary.outOfScope += 1;
    } else {
      inScope.push(property);
    }
  }
  if (summary.outOfScope > 0) {
    appendAuditEvent({
      actor: "agent",
      action: "properties_marked_out_of_scope",
      entityType: "Property",
      entityId: "portfolio",
      rationale:
        `${summary.outOfScope} bare-land parcel(s) marked out_of_scope: "${FRAMEWORK_NAME}" ` +
        "assesses built assets; land-only parcels need a framework variant.",
    });
  }

  const synthetic = inScope.filter((p) => p.provenance === "synthetic");
  const real = inScope.filter((p) => p.provenance === "real_open_data");

  // 2. Synthetic cohort: replay pre-computed seeded signals.
  for (let i = 0; i < synthetic.length; i += SYNTHETIC_BATCH_SIZE) {
    const batch = synthetic.slice(i, i + SYNTHETIC_BATCH_SIZE);
    for (const property of batch) {
      updatePropertyStatus(property.id, "scanning");
      const signals = listSignalsForProperty(property.id);
      summary.signalsAccepted += signals.length;
      updatePropertyStatus(property.id, "signals_extracted");
      summary.scanned += 1;
    }
    appendAuditEvent({
      actor: "agent",
      action: "synthetic_batch_scanned",
      entityType: "Property",
      entityId: "portfolio",
      rationale:
        `Replayed pre-computed signals for ${batch.length} synthetic properties ` +
        `(${batch[0]?.id} … ${batch[batch.length - 1]?.id}). Synthetic cohort exists for ` +
        "portfolio scale; only the real cohort goes through live investigators.",
    });
  }

  // 3. Real cohort: live investigation, parallel batches.
  if (real.length > 0 && !isLlmConfigured()) {
    summary.skippedLlmUnavailable = real.length;
    appendAuditEvent({
      actor: "agent",
      action: "scan_degraded_llm_unavailable",
      entityType: "Property",
      entityId: "portfolio",
      rationale:
        `${real.length} real properties left unscanned: OPENAI_API_KEY is not configured, ` +
        "so the live investigator team cannot run. Synthetic replay completed normally.",
    });
  } else {
    for (let i = 0; i < real.length; i += REAL_BATCH_SIZE) {
      const batch = real.slice(i, i + REAL_BATCH_SIZE);
      for (const property of batch) updatePropertyStatus(property.id, "scanning");
      const results = await Promise.all(
        batch.map(async (property) => {
          const r = await investigateProperty(property, framework);
          updatePropertyStatus(property.id, "signals_extracted");
          return r;
        }),
      );
      for (const r of results) {
        summary.scanned += 1;
        summary.signalsAccepted += r.signalsAccepted;
        summary.signalsRejected += r.signalsRejected;
        summary.fairnessBlocked += r.fairnessBlocked;
        summary.investigationFailures += r.investigationFailures;
      }
      logger.info("Real batch investigated", {
        from: batch[0]?.id,
        count: batch.length,
        progress: `${Math.min(i + REAL_BATCH_SIZE, real.length)}/${real.length}`,
      });
    }
  }

  appendAuditEvent({
    actor: "agent",
    action: "portfolio_scanned",
    entityType: "Property",
    entityId: "portfolio",
    rationale:
      `scanPortfolio complete: ${summary.scanned} scanned (${real.length} real, ` +
      `${synthetic.length} synthetic), ${summary.outOfScope} out of scope, ` +
      `${summary.signalsAccepted} sourced signals, ${summary.signalsRejected} rejected unsourced, ` +
      `${summary.fairnessBlocked} blocked by the fairness guardrail.`,
    payloadSnapshot: summary,
  });
  return summary;
}
