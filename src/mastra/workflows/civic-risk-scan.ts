import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { appendAuditEvent } from "@/db/access/audit";
import { listAdjudications } from "@/db/access/adjudications";
import { listClusters } from "@/db/access/clusters";
import { listEvidenceUpdates } from "@/db/access/evidence";
import { adjudicateProperty, applyHumanAdjudication } from "@/mastra/engine/adjudication";
import { clusterByRiskPattern } from "@/mastra/engine/clustering";
import {
  composeAllAssessments,
  composeAssessment,
  publishCluster,
  reviewCluster,
} from "@/mastra/engine/compose";
import { closeOutCampaign } from "@/mastra/engine/metrics";
import { scanProperties } from "@/mastra/engine/scan";
import { getLogger } from "@/infrastructure/logging/logger";

const logger = getLogger("workflow:civic-risk-scan");

/**
 * The `civic-risk-scan` campaign workflow (spec §4.2):
 *
 *   scanPortfolio → clusterByRiskPattern → composeAssessments
 *   ⏸ awaitAssessmentReview  (suspend; one resume per review decision)
 *   → publish approved clusters (inside the gate step, hard-gated)
 *   adjudicateEvidence        (⏸ event-driven: one resume per feed update)
 *   ⏸ awaitHumanAdjudication  (suspend; one resume per expert decision)
 *   closeOut
 *
 * Deterministic control flow lives here; open-ended reasoning lives in the
 * agents. Every step writes AuditEvents through the engine functions.
 */

/** One context object threads through every step (accumulated results). */
const campaignContextSchema = z.object({
  /** Restrict the scan to these properties (single lookup = a list of 1). */
  propertyIds: z.array(z.string().min(1)).optional(),
  minClusterSize: z.number().int().positive().optional(),
  scanSummary: z.record(z.string(), z.unknown()).optional(),
  clusterCount: z.number().optional(),
  composedCount: z.number().optional(),
  publishedCount: z.number().optional(),
  evidenceProcessed: z.number().optional(),
  humanDecisions: z.number().optional(),
});
type CampaignContext = z.infer<typeof campaignContextSchema>;

// ---------------------------------------------------------------------------
// Step 1 — scanPortfolio (parallel batches inside the engine)
// ---------------------------------------------------------------------------

const scanPortfolioStep = createStep({
  id: "scan-portfolio",
  inputSchema: campaignContextSchema,
  outputSchema: campaignContextSchema,
  execute: async ({ inputData }): Promise<CampaignContext> => {
    const summary = await scanProperties(inputData.propertyIds);
    return { ...inputData, scanSummary: { ...summary } };
  },
});

// ---------------------------------------------------------------------------
// Step 2 — clusterByRiskPattern (deterministic group-by)
// ---------------------------------------------------------------------------

const clusterByRiskPatternStep = createStep({
  id: "cluster-by-risk-pattern",
  inputSchema: campaignContextSchema,
  outputSchema: campaignContextSchema,
  execute: async ({ inputData }): Promise<CampaignContext> => {
    const clusters = await clusterByRiskPattern({ minClusterSize: inputData.minClusterSize });
    return { ...inputData, clusterCount: clusters.length };
  },
});

// ---------------------------------------------------------------------------
// Step 3 — composeAssessments (assessment-composer per cluster)
// ---------------------------------------------------------------------------

const composeAssessmentsStep = createStep({
  id: "compose-assessments",
  inputSchema: campaignContextSchema,
  outputSchema: campaignContextSchema,
  execute: async ({ inputData }): Promise<CampaignContext> => {
    const composed = await composeAllAssessments();
    return { ...inputData, composedCount: composed.length };
  },
});

// ---------------------------------------------------------------------------
// Step 4 — ⏸ awaitAssessmentReview
// One resume() per review decision. Approve → publish (hard-gated inside
// publishCluster). Request changes → back to draft, re-composed with the
// comments, pending again. The step re-suspends until no cluster is left
// in draft/pending_review.
// ---------------------------------------------------------------------------

const reviewDecisionSchema = z.object({
  clusterId: z.string().min(1),
  decision: z.enum(["approve", "request_changes"]),
  reviewedBy: z.string().min(1),
  comments: z.string().optional(),
});
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;

const reviewSuspendSchema = z.object({
  message: z.string(),
  pendingClusterIds: z.array(z.string()),
});

const awaitAssessmentReviewStep = createStep({
  id: "await-assessment-review",
  inputSchema: campaignContextSchema,
  outputSchema: campaignContextSchema,
  resumeSchema: reviewDecisionSchema,
  suspendSchema: reviewSuspendSchema,
  execute: async ({ inputData, resumeData, suspend }): Promise<CampaignContext> => {
    if (resumeData) {
      const { clusterId, decision, reviewedBy, comments } = resumeData;
      const reviewed = reviewCluster(clusterId, decision, reviewedBy, comments);
      if (decision === "approve") {
        await publishCluster(reviewed.id);
      } else {
        await composeAssessment(clusterId, comments);
      }
    }

    const awaiting = listClusters().filter(
      (c) => c.status === "pending_review" || c.status === "draft",
    );
    if (awaiting.length > 0) {
      return (await suspend({
        message:
          "The agent is waiting for your review. Approve to publish, or request changes with comments.",
        pendingClusterIds: awaiting.map((c) => c.id),
      })) as CampaignContext;
    }

    const published = listClusters().filter(
      (c) => c.status === "published" || c.status === "completed",
    ).length;
    return { ...inputData, publishedCount: published };
  },
});

// ---------------------------------------------------------------------------
// Step 5 — ⏸ adjudicateEvidence (event-driven)
// The evidence-feed simulator resumes this step once per injected update;
// the two hard-coded rules run in the engine on every event. A {kind:
// "close"} event (feed exhausted / director) exits the monitoring loop.
// ---------------------------------------------------------------------------

const evidenceEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("evidence"),
    updateId: z.string().min(1),
    propertyId: z.string().min(1),
  }),
  z.object({ kind: z.literal("close") }),
]);
export type EvidenceEvent = z.infer<typeof evidenceEventSchema>;

const adjudicateEvidenceStep = createStep({
  id: "adjudicate-evidence",
  inputSchema: campaignContextSchema,
  outputSchema: campaignContextSchema,
  resumeSchema: evidenceEventSchema,
  suspendSchema: z.object({ message: z.string(), monitoring: z.number() }),
  execute: async ({ inputData, resumeData, suspend }): Promise<CampaignContext> => {
    if (resumeData?.kind === "close") {
      const processed = listAdjudications().filter((a) => a.latestEvidence !== null).length;
      appendAuditEvent({
        actor: "agent",
        action: "evidence_monitoring_closed",
        entityType: "Adjudication",
        entityId: "portfolio",
        rationale: `Evidence monitoring closed; ${processed} adjudications received feed updates.`,
      });
      return { ...inputData, evidenceProcessed: processed };
    }

    if (resumeData?.kind === "evidence") {
      const update = listEvidenceUpdates().find((u) => u.id === resumeData.updateId);
      const adjudication = listAdjudications().find(
        (a) => a.propertyId === resumeData.propertyId,
      );
      if (!update || !adjudication) {
        logger.warn("Evidence event ignored — unknown update or adjudication", resumeData);
      } else {
        await adjudicateProperty({
          adjudicationId: adjudication.id,
          propertyId: adjudication.propertyId,
          clusterId: adjudication.clusterId,
          incoming: update,
          withLlm: true,
        });
      }
    }

    const monitoring = listAdjudications().filter((a) =>
      ["monitoring", "assessing", "queued", "evidence_received"].includes(a.status),
    ).length;
    return (await suspend({
      message: "Monitoring open-data feeds; adjudicating evidence as it arrives.",
      monitoring,
    })) as CampaignContext;
  },
});

// ---------------------------------------------------------------------------
// Step 6 — ⏸ awaitHumanAdjudication
// Every escalated (red) case suspends the campaign until the expert decides:
// confirm risk / request more evidence / mark resolved. Red cases are never
// auto-resolved.
// ---------------------------------------------------------------------------

const humanDecisionSchema = z.object({
  adjudicationId: z.string().min(1),
  action: z.enum(["confirm_risk", "request_more_evidence", "mark_resolved"]),
  comments: z.string().optional(),
});
export type HumanDecision = z.infer<typeof humanDecisionSchema>;

const awaitHumanAdjudicationStep = createStep({
  id: "await-human-adjudication",
  inputSchema: campaignContextSchema,
  outputSchema: campaignContextSchema,
  resumeSchema: humanDecisionSchema,
  suspendSchema: z.object({ message: z.string(), escalatedIds: z.array(z.string()) }),
  execute: async ({ inputData, resumeData, suspend }): Promise<CampaignContext> => {
    if (resumeData) {
      applyHumanAdjudication(
        resumeData.adjudicationId,
        resumeData.action,
        resumeData.comments ?? "",
      );
    }

    const escalated = listAdjudications().filter((a) => a.status === "escalated");
    if (escalated.length > 0) {
      return (await suspend({
        message: `${escalated.length} escalated case(s) await the analyst's decision.`,
        escalatedIds: escalated.map((a) => a.id),
      })) as CampaignContext;
    }
    return {
      ...inputData,
      humanDecisions: (inputData.humanDecisions ?? 0) + (resumeData ? 1 : 0),
    };
  },
});

// ---------------------------------------------------------------------------
// Step 7 — closeOut
// ---------------------------------------------------------------------------

const closeOutStep = createStep({
  id: "close-out",
  inputSchema: campaignContextSchema,
  outputSchema: z.object({
    metrics: z.record(z.string(), z.unknown()),
    context: campaignContextSchema,
  }),
  execute: async ({ inputData }) => {
    const metrics = closeOutCampaign();
    return { metrics: { ...metrics }, context: inputData };
  },
});

export const civicRiskScanWorkflow = createWorkflow({
  id: "civic-risk-scan",
  inputSchema: campaignContextSchema,
  outputSchema: z.object({
    metrics: z.record(z.string(), z.unknown()),
    context: campaignContextSchema,
  }),
})
  .then(scanPortfolioStep)
  .then(clusterByRiskPatternStep)
  .then(composeAssessmentsStep)
  .then(awaitAssessmentReviewStep)
  .then(adjudicateEvidenceStep)
  .then(awaitHumanAdjudicationStep)
  .then(closeOutStep)
  .commit();
