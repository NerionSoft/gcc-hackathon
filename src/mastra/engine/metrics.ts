import { getDb } from "@/db/client";
import { appendAuditEvent } from "@/db/access/audit";
import { listClusters, upsertCluster } from "@/db/access/clusters";
import { listAdjudications, upsertAdjudication } from "@/db/access/adjudications";
import { updatePropertyStatus } from "@/db/access/properties";

/**
 * Civic-impact metrics (spec F5) + the closeOut step's final aggregation.
 * Baseline: manual due diligence runs ~6-8h per site; we count 7h saved per
 * property that reached at least signal extraction.
 */

const ANALYST_HOURS_PER_SITE = 7;

export interface ImpactMetrics {
  propertiesTotal: number;
  propertiesAssessed: number;
  propertiesOutOfScope: number;
  statusCounts: Record<string, number>;
  analystHoursSaved: number;
  capitalScreenedGbp: number;
  escalatedCount: number;
  escalatedPct: number;
  /** Material (amber/red) sourced risks a listing would not volunteer. */
  hiddenRisksRevealed: number;
  sourcesCited: number;
  distinctDatasets: number;
  auditEvents: number;
}

export function computeImpactMetrics(): ImpactMetrics {
  const db = getDb();
  const statusRows = db
    .prepare("SELECT status, COUNT(*) AS n FROM properties GROUP BY status")
    .all() as { status: string; n: number }[];
  const statusCounts = Object.fromEntries(statusRows.map((r) => [r.status, r.n]));
  const total = statusRows.reduce((n, r) => n + r.n, 0);
  const unprocessed =
    (statusCounts["unscanned"] ?? 0) + (statusCounts["scanning"] ?? 0) + (statusCounts["out_of_scope"] ?? 0);
  const assessed = total - unprocessed;

  const capital = (
    db
      .prepare(
        `SELECT COALESCE(SUM(value), 0) AS v FROM properties
         WHERE status NOT IN ('unscanned', 'scanning', 'out_of_scope')`,
      )
      .get() as { v: number }
  ).v;

  const escalated = (
    db.prepare("SELECT COUNT(*) AS n FROM adjudications WHERE status = 'escalated'").get() as {
      n: number;
    }
  ).n;
  const adjudicationsTotal = (
    db.prepare("SELECT COUNT(*) AS n FROM adjudications").get() as { n: number }
  ).n;

  const hiddenRisks = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM risk_signals s
         JOIN properties p ON p.id = s.property_id
         WHERE s.severity IN ('amber', 'red')
           AND p.status NOT IN ('unscanned', 'scanning', 'out_of_scope')`,
      )
      .get() as { n: number }
  ).n;
  const sourcesCited = (
    db.prepare("SELECT COUNT(*) AS n FROM risk_signals").get() as { n: number }
  ).n;
  const distinctDatasets = (
    db.prepare("SELECT COUNT(DISTINCT source_dataset) AS n FROM risk_signals").get() as {
      n: number;
    }
  ).n;
  const auditEvents = (
    db.prepare("SELECT COUNT(*) AS n FROM audit_events").get() as { n: number }
  ).n;

  return {
    propertiesTotal: total,
    propertiesAssessed: assessed,
    propertiesOutOfScope: statusCounts["out_of_scope"] ?? 0,
    statusCounts,
    analystHoursSaved: assessed * ANALYST_HOURS_PER_SITE,
    capitalScreenedGbp: capital,
    escalatedCount: escalated,
    escalatedPct: adjudicationsTotal > 0 ? Math.round((escalated / adjudicationsTotal) * 1000) / 10 : 0,
    hiddenRisksRevealed: hiddenRisks,
    sourcesCited,
    distinctDatasets,
    auditEvents,
  };
}

/**
 * closeOut (spec §4.2, final step): resolve the green monitoring cases
 * (never the reds — no auto-resolution of red, ever), complete published
 * clusters, and journal the final civic-impact aggregates.
 */
export function closeOutCampaign(): ImpactMetrics {
  const now = new Date().toISOString();

  for (const adjudication of listAdjudications()) {
    if (adjudication.status === "monitoring" && adjudication.compositeVerdict === "green") {
      upsertAdjudication({ ...adjudication, status: "resolved", lastActivityAt: now });
      updatePropertyStatus(adjudication.propertyId, "closed");
    }
  }
  for (const cluster of listClusters()) {
    if (cluster.status === "published") {
      upsertCluster({ ...cluster, status: "completed" });
    }
  }

  const metrics = computeImpactMetrics();
  appendAuditEvent({
    actor: "agent",
    action: "campaign_closed",
    entityType: "Property",
    entityId: "portfolio",
    rationale:
      `closeOut: ${metrics.propertiesAssessed}/${metrics.propertiesTotal} properties assessed, ` +
      `£${Math.round(metrics.capitalScreenedGbp / 1e6)}m capital screened, ` +
      `${metrics.escalatedCount} cases escalated (${metrics.escalatedPct}%), ` +
      `${metrics.hiddenRisksRevealed} material sourced risks revealed, ` +
      `${metrics.sourcesCited} sourced citations across ${metrics.distinctDatasets} open datasets. ` +
      "Green monitoring cases resolved; red cases remain with the human analyst — never auto-resolved.",
    payloadSnapshot: metrics,
  });
  return metrics;
}
