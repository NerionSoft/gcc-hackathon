import { appendAuditEvent } from "@/db/access/audit";
import { getCluster, listClusters, upsertCluster } from "@/db/access/clusters";
import { getProperty, updatePropertyStatus } from "@/db/access/properties";
import { listSignalsForProperty } from "@/db/access/signals";
import type { RiskCluster, RiskSignal } from "@/db/schema";
import {
  assessmentComposer,
  composedAssessmentSchema,
} from "@/mastra/agents/assessment-composer";
import { generateStructured } from "@/mastra/agents/structured";
import { adjudicateProperty } from "@/mastra/engine/adjudication";
import { isLlmConfigured } from "@/mastra/llm";
import { getLogger } from "@/infrastructure/logging/logger";

const logger = getLogger("engine:compose");

/**
 * composeAssessments + publishCluster + closeOut engine (spec §4.2 phases 3).
 * Nothing is published while reviewedAt is null — hard-coded, tested.
 */

interface SignalDigestEntry {
  signalCode: string;
  count: number;
  severities: Record<string, number>;
  samples: { finding: string; severity: string; sourceRef: RiskSignal["sourceRef"] }[];
}

function clusterSignalDigest(cluster: RiskCluster): SignalDigestEntry[] {
  const byCode = new Map<string, SignalDigestEntry>();
  for (const propertyId of cluster.propertyIds) {
    for (const s of listSignalsForProperty(propertyId)) {
      const entry = byCode.get(s.signalCode) ?? {
        signalCode: s.signalCode,
        count: 0,
        severities: {},
        samples: [],
      };
      entry.count += 1;
      entry.severities[s.severity] = (entry.severities[s.severity] ?? 0) + 1;
      if (entry.samples.length < 2 && s.severity !== "green") {
        entry.samples.push({ finding: s.finding, severity: s.severity, sourceRef: s.sourceRef });
      }
      byCode.set(s.signalCode, entry);
    }
  }
  // Green-only codes still get one sample so the composer can cite them.
  for (const propertyId of cluster.propertyIds.slice(0, 10)) {
    for (const s of listSignalsForProperty(propertyId)) {
      const entry = byCode.get(s.signalCode);
      if (entry && entry.samples.length === 0) {
        entry.samples.push({ finding: s.finding, severity: s.severity, sourceRef: s.sourceRef });
      }
    }
  }
  return [...byCode.values()].sort((a, b) => a.signalCode.localeCompare(b.signalCode));
}

function fallbackAssessment(cluster: RiskCluster, digest: SignalDigestEntry[]): {
  assessment: string;
  disclosure: string;
} {
  const lines = digest.map(
    (d) =>
      `- **${d.signalCode}** — ${d.count} finding(s) (${Object.entries(d.severities)
        .map(([sev, n]) => `${n} ${sev}`)
        .join(", ")})` +
      (d.samples[0]
        ? `; e.g. "${d.samples[0].finding}" [${d.samples[0].sourceRef.dataset} ${d.samples[0].sourceRef.recordId}]`
        : ""),
  );
  return {
    assessment: [
      `## Risk assessment — ${cluster.name}`,
      "",
      `Shared pattern: **${cluster.pattern}**. ${cluster.groupingRationale}`,
      "",
      "### Evidence base",
      ...lines,
      "",
      "_Deterministic dossier (no LLM configured): composed mechanically from the sourced signals above._",
    ].join("\n"),
    disclosure: [
      `**What we found for the properties in "${cluster.name}"**`,
      "",
      "The public records we checked show the following, with the register each fact comes from:",
      ...lines,
      "",
      "Ask the seller or your adviser about each point above before committing money.",
      "This report describes risk from public records; the decision to proceed is yours.",
    ].join("\n"),
  };
}

/**
 * Compose (or re-compose after review comments) the assessment + disclosure
 * of one draft cluster, strictly from its sourced signals. Moves the cluster
 * to pending_review and its properties to verdict_pending_review.
 */
export async function composeAssessment(
  clusterId: string,
  reviewerComments?: string,
): Promise<RiskCluster> {
  const cluster = getCluster(clusterId);
  if (!cluster) throw new Error(`Cluster not found: ${clusterId}`);
  const digest = clusterSignalDigest(cluster);

  let assessment: string;
  let disclosure: string;
  let composedBy: "agent-llm" | "deterministic-fallback";

  if (isLlmConfigured()) {
    const result = await generateStructured(
      assessmentComposer,
      [
        "Compose the risk assessment and plain-language disclosure for this cluster.",
        "",
        `CLUSTER: ${JSON.stringify(
          {
            name: cluster.name,
            description: cluster.description,
            pattern: cluster.pattern,
            groupingRationale: cluster.groupingRationale,
            memberCount: cluster.propertyIds.length,
          },
          null,
          2,
        )}`,
        "",
        `SOURCED SIGNAL DIGEST (the ONLY facts you may use):`,
        JSON.stringify(digest, null, 2),
        reviewerComments
          ? `\nREVIEWER COMMENTS on the previous draft (address each one):\n${reviewerComments}`
          : "",
      ].join("\n"),
      composedAssessmentSchema,
      { maxSteps: 1 },
    );
    if (result.ok) {
      assessment = result.value.assessment;
      disclosure = result.value.disclosure;
      composedBy = "agent-llm";
    } else {
      appendAuditEvent({
        actor: "agent",
        action: "assessment_composition_failed",
        entityType: "RiskCluster",
        entityId: cluster.id,
        rationale: `assessment-composer output failed validation after 1 retry (${result.detail}); deterministic fallback used.`,
      });
      ({ assessment, disclosure } = fallbackAssessment(cluster, digest));
      composedBy = "deterministic-fallback";
    }
  } else {
    ({ assessment, disclosure } = fallbackAssessment(cluster, digest));
    composedBy = "deterministic-fallback";
  }

  const updated = upsertCluster({
    ...cluster,
    proposedAssessment: assessment,
    proposedDisclosure: disclosure,
    status: "pending_review",
    reviewedBy: null,
    reviewedAt: null,
  });
  for (const propertyId of cluster.propertyIds) {
    updatePropertyStatus(propertyId, "verdict_pending_review");
  }

  appendAuditEvent({
    actor: "agent",
    action: reviewerComments ? "assessment_recomposed" : "assessment_composed",
    entityType: "RiskCluster",
    entityId: cluster.id,
    rationale:
      `Assessment + plain-language disclosure composed (${composedBy}) strictly from ` +
      `${digest.reduce((n, d) => n + d.count, 0)} sourced signals across ` +
      `${digest.length} signal codes. Cluster now awaits human review — nothing publishes without it.` +
      (reviewerComments ? ` Re-draft addressing reviewer comments: "${reviewerComments}"` : ""),
  });
  return updated;
}

/** Compose every draft cluster (initial pass of the gates phase). */
export async function composeAllAssessments(): Promise<RiskCluster[]> {
  const drafts = listClusters().filter((c) => c.status === "draft");
  const composed: RiskCluster[] = [];
  for (const cluster of drafts) {
    composed.push(await composeAssessment(cluster.id));
    logger.info("Cluster assessment composed", { clusterId: cluster.id });
  }
  return composed;
}

/** Record the human review decision on a pending cluster. */
export function reviewCluster(
  clusterId: string,
  decision: "approve" | "request_changes",
  reviewedBy: string,
  comments?: string,
): RiskCluster {
  const cluster = getCluster(clusterId);
  if (!cluster) throw new Error(`Cluster not found: ${clusterId}`);
  if (cluster.status !== "pending_review") {
    throw new Error(`Cluster ${clusterId} is not awaiting review (status: ${cluster.status})`);
  }

  if (decision === "approve") {
    const approved = upsertCluster({
      ...cluster,
      status: "approved",
      reviewedBy,
      reviewedAt: new Date().toISOString(),
    });
    appendAuditEvent({
      actor: "user:nadia",
      action: "assessment_approved",
      entityType: "RiskCluster",
      entityId: clusterId,
      rationale: comments?.trim() || `Assessment approved by ${reviewedBy}.`,
    });
    return approved;
  }

  const rejected = upsertCluster({
    ...cluster,
    status: "draft",
    reviewedBy: null,
    reviewedAt: null,
  });
  appendAuditEvent({
    actor: "user:nadia",
    action: "assessment_changes_requested",
    entityType: "RiskCluster",
    entityId: clusterId,
    rationale: comments?.trim() || "Changes requested on the assessment; back to draft.",
  });
  return rejected;
}

/**
 * publishCluster (spec §4.2): HARD-CODED — throws when reviewedAt is null.
 * Creates the member adjudications (queued → assessing → monitoring /
 * escalated) and stamps the audit trail.
 */
export async function publishCluster(clusterId: string): Promise<RiskCluster> {
  const cluster = getCluster(clusterId);
  if (!cluster) throw new Error(`Cluster not found: ${clusterId}`);
  if (cluster.reviewedAt === null || cluster.status !== "approved") {
    throw new Error(
      `Refusing to publish cluster ${clusterId}: it has not been approved by a named human ` +
        `reviewer (status=${cluster.status}, reviewedAt=${String(cluster.reviewedAt)}). ` +
        "Nothing is published while reviewedAt is null.",
    );
  }

  let escalated = 0;
  for (const propertyId of cluster.propertyIds) {
    const property = getProperty(propertyId);
    const adjudication = await adjudicateProperty({
      adjudicationId: `adj-${clusterId}-${propertyId}`,
      propertyId,
      clusterId,
      withLlm: property?.provenance === "real_open_data",
    });
    if (adjudication.status === "escalated") escalated += 1;
  }

  const published = upsertCluster({ ...cluster, status: "published" });
  appendAuditEvent({
    actor: "agent",
    action: "cluster_published",
    entityType: "RiskCluster",
    entityId: clusterId,
    rationale:
      `Cluster published after review by ${cluster.reviewedBy} at ${cluster.reviewedAt}: ` +
      `${cluster.propertyIds.length} adjudications opened, ${escalated} escalated at first verdict.`,
    payloadSnapshot: { reviewedBy: cluster.reviewedBy, reviewedAt: cluster.reviewedAt, escalated },
  });
  return published;
}
