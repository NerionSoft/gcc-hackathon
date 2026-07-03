import "dotenv/config";
/* eslint-disable no-console */
import { getDb } from "@/db/client";
import { listAdjudications } from "@/db/access/adjudications";
import { listAuditEvents } from "@/db/access/audit";
import { listClusters } from "@/db/access/clusters";
import { listEvidenceUpdates } from "@/db/access/evidence";
import { listProperties } from "@/db/access/properties";
import { listSignalsForProperty } from "@/db/access/signals";
import { applyHumanAdjudication } from "@/mastra/engine/adjudication";
import {
  getCampaignStatus,
  resumeAssessmentReview,
  resumeEvidence,
  resumeHumanAdjudication,
  startCampaign,
} from "@/mastra/engine/campaign";
import { pickTarget } from "@/mastra/simulator/evidence-feed-simulator";
import { isLlmConfigured } from "@/mastra/llm";

/**
 * End-to-end console proof of the civic-risk-scan engine (spec §10 step 2:
 * "Vérif console avant UI"). Drives the REAL workflow through every gate:
 *
 *   pnpm tsx scripts/run-engine.ts           # full portfolio (50 real via LLM)
 *   pnpm tsx scripts/run-engine.ts --smoke   # 3 real properties only
 *
 * Prints sourced signals (sourceRefs visible), cluster table, gate
 * decisions, escalations and final civic-impact metrics.
 */

const SMOKE = process.argv.includes("--smoke");
const EVIDENCE_TO_REPLAY = SMOKE ? 5 : 40;

function h(title: string): void {
  console.log(`\n${"=".repeat(78)}\n${title}\n${"=".repeat(78)}`);
}

async function waitAtGate(gate: string, timeoutMs = 30 * 60_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    const status = await getCampaignStatus();
    if (status.suspendedSteps.includes(gate)) return;
    if (status.status === "failed") throw new Error(`Workflow failed before reaching ${gate}`);
    if (status.status === "success") throw new Error(`Workflow finished before reaching ${gate}`);
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for gate ${gate}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function main(): Promise<void> {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) n FROM properties").get() as { n: number }).n;
  if (total === 0) throw new Error("Empty database — run `pnpm seed` first.");
  console.log(`Portfolio: ${total} properties. LLM configured: ${isLlmConfigured()}.`);

  // ---------------------------------------------------------------- scan
  h("1. scanPortfolio + clusterByRiskPattern + composeAssessments");
  const real = listProperties({ limit: 5000 }).filter((p) => p.provenance === "real_open_data");
  const input = SMOKE
    ? { propertyIds: real.slice(0, 3).map((p) => p.id), minClusterSize: 1 }
    : {};
  const runId = await startCampaign(input);
  console.log(`Campaign run: ${runId}${SMOKE ? " (smoke: 3 real properties)" : ""}`);

  await waitAtGate("await-assessment-review");

  console.log("\n--- Sourced signals for real properties (live investigator output) ---");
  const investigated = real.filter((p) => listSignalsForProperty(p.id).length > 0);
  console.log(`${investigated.length} real properties carry sourced signals. Showing 3:`);
  for (const property of investigated.slice(0, 3)) {
    console.log(`\n▸ ${property.id} — ${property.address}, ${property.postcode}`);
    for (const s of listSignalsForProperty(property.id)) {
      console.log(
        `   [${s.severity.toUpperCase().padEnd(5)}] ${s.signalCode.padEnd(18)} conf=${s.confidence.toFixed(2)}\n` +
          `           ${s.finding}\n` +
          `           source: ${s.sourceRef.dataset} | ${s.sourceRef.recordId} | ${s.sourceRef.url} | ${s.sourceRef.retrievedAt}`,
      );
    }
  }

  console.log("\n--- Clusters (deterministic group-by) ---");
  for (const c of listClusters()) {
    console.log(
      `  ${c.id.padEnd(38)} ${String(c.propertyIds.length).padStart(5)} properties  [${c.status}]  pattern: ${c.pattern}`,
    );
  }

  // ------------------------------------------------------------- review gate
  h("2. ⏸ awaitAssessmentReview — approve every cluster (as Nadia)");
  for (;;) {
    const status = await getCampaignStatus();
    if (!status.suspendedSteps.includes("await-assessment-review")) break;
    const payload = status.suspendPayloads["await-assessment-review"] as {
      pendingClusterIds?: string[];
    } | null;
    const next = payload?.pendingClusterIds?.[0];
    if (!next) break;
    console.log(`  approving ${next} …`);
    await resumeAssessmentReview({
      clusterId: next,
      decision: "approve",
      reviewedBy: "Nadia (Head of Due Diligence)",
      comments: "Assessment matches the cited records; disclosure reads clearly.",
    });
  }
  const adjudications = listAdjudications();
  const escalatedAtPublish = adjudications.filter((a) => a.status === "escalated");
  console.log(
    `Published. ${adjudications.length} adjudications opened; ${escalatedAtPublish.length} escalated at first verdict ` +
      `(${((escalatedAtPublish.length / Math.max(1, adjudications.length)) * 100).toFixed(1)}%).`,
  );

  // ------------------------------------------------------------- evidence
  h(`3. ⏸ adjudicateEvidence — replay ${EVIDENCE_TO_REPLAY} feed updates`);
  await waitAtGate("adjudicate-evidence");
  const updates = listEvidenceUpdates().slice(0, EVIDENCE_TO_REPLAY);
  for (const [i, update] of updates.entries()) {
    const target = pickTarget(update, i);
    if (!target) break;
    await resumeEvidence({ kind: "evidence", updateId: update.id, propertyId: target.propertyId });
    const adj = listAdjudications().find((a) => a.propertyId === target.propertyId);
    console.log(
      `  [${update.kind.padEnd(16)}] ${update.headline.slice(0, 60).padEnd(62)} → ${target.propertyId} ` +
        `verdict=${adj?.compositeVerdict} status=${adj?.status}`,
    );
  }
  await resumeEvidence({ kind: "close" });

  // ------------------------------------------------------- human adjudication
  h("4. ⏸ awaitHumanAdjudication — expert decisions on escalated cases");
  await waitAtGate("await-human-adjudication");
  let escalated = listAdjudications().filter((a) => a.status === "escalated");
  console.log(`${escalated.length} escalated case(s) awaiting the analyst.`);
  // Bulk decisions through the engine (same function the API uses), keeping
  // the final one for the workflow gate so the campaign proceeds to closeOut.
  while (escalated.length > 1) {
    const a = escalated[0];
    if (!a) break;
    applyHumanAdjudication(
      a.id,
      "confirm_risk",
      `Confirmed after review: ${a.escalationReason ?? "corroborated red"} on ${a.propertyId}.`,
    );
    escalated = listAdjudications().filter((x) => x.status === "escalated");
  }
  const last = escalated[0];
  if (last) {
    console.log(`  final decision via workflow resume: confirm_risk on ${last.id}`);
    await resumeHumanAdjudication({
      adjudicationId: last.id,
      action: "confirm_risk",
      comments: "Confirmed: evidence-integrity escalation stands until corroborated.",
    });
  }

  // ------------------------------------------------------------- close out
  h("5. closeOut — final civic-impact metrics");
  for (;;) {
    const status = await getCampaignStatus();
    if (status.status === "success" || status.status === "failed") {
      console.log(`Workflow status: ${status.status}`);
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  const metricsEvent = listAuditEvents({ entityType: "Property", entityId: "portfolio" }).find(
    (e) => e.action === "campaign_closed",
  );
  console.log(JSON.stringify(metricsEvent?.payloadSnapshot ?? {}, null, 2));

  const auditCount = (db.prepare("SELECT COUNT(*) n FROM audit_events").get() as { n: number }).n;
  console.log(`\nAudit ledger: ${auditCount} append-only events. Sample of the last 5:`);
  for (const e of listAuditEvents({ limit: 5 })) {
    console.log(`  [${e.timestamp}] ${e.actor.padEnd(10)} ${e.action.padEnd(32)} ${e.entityType}:${e.entityId}`);
  }
  console.log("\n✅ End-to-end engine run complete.");
  process.exit(0);
}

main().catch((error) => {
  console.error("\n❌ Engine run failed:", error);
  process.exit(1);
});
