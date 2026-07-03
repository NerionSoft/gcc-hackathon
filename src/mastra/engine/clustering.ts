import { appendAuditEvent } from "@/db/access/audit";
import { listProperties, updatePropertyStatus } from "@/db/access/properties";
import { listSignalsForProperty } from "@/db/access/signals";
import { upsertCluster } from "@/db/access/clusters";
import type { Property, RiskCluster, RiskSignal, Severity } from "@/db/schema";
import { assessmentComposer } from "@/mastra/agents/assessment-composer";
import { generateStructured } from "@/mastra/agents/structured";
import { isLlmConfigured } from "@/mastra/llm";
import { z } from "zod";
import { getLogger } from "@/infrastructure/logging/logger";

const logger = getLogger("engine:clustering");

/**
 * clusterByRiskPattern (spec §4.2) — DETERMINISTIC grouping. Membership is
 * pure group-by (no embeddings, no LLM choice); the LLM writes only the
 * human-readable groupingRationale text.
 *
 * Grouping key, two deterministic tiers:
 * 1. Per-dimension severity signature: the worst severity per dimension,
 *    keeping dimensions at amber or worse (e.g. "LAND:red",
 *    "BUILDING:amber+PEOPLE:amber"); no material dimension → "CLEAN".
 * 2. Within one signature, split by (localAuthority, propertyType) ONLY when
 *    every resulting subgroup reaches `minClusterSize` (the spec's full key,
 *    applied where the data supports it without dust clusters).
 * Signature groups below `minClusterSize` coalesce into one COMPOUND cluster
 * (multi-dimension patterns are individually rare but collectively the most
 * review-worthy). On the seeded portfolio this yields ~9 clusters.
 */

const SEVERITY_RANK: Record<Severity, number> = { green: 0, amber: 1, red: 2 };

export const COMPOUND_SIGNATURE = "COMPOUND";
export const CLEAN_SIGNATURE = "CLEAN";

/** Worst severity per dimension → canonical signature string. */
export function severitySignature(signals: RiskSignal[]): string {
  const worst = new Map<string, Severity>();
  for (const s of signals) {
    const current = worst.get(s.dimensionCode);
    if (!current || SEVERITY_RANK[s.severity] > SEVERITY_RANK[current]) {
      worst.set(s.dimensionCode, s.severity);
    }
  }
  const material = [...worst.entries()]
    .filter(([, sev]) => sev !== "green")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dim, sev]) => `${dim}:${sev}`);
  return material.length > 0 ? material.join("+") : CLEAN_SIGNATURE;
}

/** Deterministic, stable cluster id from its grouping key. */
function clusterId(key: string): string {
  return `cluster-${key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

/** Dominant signal codes at material severity — the cluster's `pattern`. */
function dominantPattern(members: MemberInfo[]): string {
  const counts = new Map<string, number>();
  for (const m of members) {
    for (const s of m.signals) {
      if (s.severity === "green") continue;
      const key = `${s.signalCode}:${s.severity}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([key]) => key);
  return top.length > 0 ? top.join(" + ") : "no-material-risk";
}

interface MemberInfo {
  property: Property;
  signals: RiskSignal[];
  signature: string;
}

interface ProtoCluster {
  key: string;
  signature: string;
  localAuthority: string | null;
  propertyType: string | null;
  members: MemberInfo[];
}

function describe(proto: ProtoCluster): { name: string; description: string } {
  const las = new Map<string, number>();
  for (const m of proto.members) {
    las.set(m.property.localAuthority, (las.get(m.property.localAuthority) ?? 0) + 1);
  }
  const laText = [...las.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([la, n]) => `${la} (${n})`)
    .join(", ");

  if (proto.signature === CLEAN_SIGNATURE) {
    return {
      name: "No material sourced risk",
      description: `Properties whose open-data signals are all green. Spread: ${laText}.`,
    };
  }
  if (proto.signature === COMPOUND_SIGNATURE) {
    return {
      name: "Compound risk patterns",
      description:
        `Properties whose per-dimension severity signature is individually rare — ` +
        `typically risks across several dimensions at once. Spread: ${laText}.`,
    };
  }
  const scope =
    proto.localAuthority !== null
      ? ` in ${proto.localAuthority} (${proto.propertyType})`
      : "";
  return {
    name: `${proto.signature.replaceAll("+", " + ")}${scope}`,
    description: `Shared severity signature ${proto.signature}${scope}. Spread: ${laText}.`,
  };
}

const rationaleSchema = z.object({ rationale: z.string().min(1) });

async function groupingRationale(
  proto: ProtoCluster,
  pattern: string,
): Promise<string> {
  const deterministic =
    `Deterministic group-by: every member shares the per-dimension severity signature ` +
    `"${proto.signature}"` +
    (proto.localAuthority !== null
      ? `, local authority "${proto.localAuthority}" and property type "${proto.propertyType}"`
      : "") +
    `. Dominant sourced pattern: ${pattern}. Membership was computed by code, not by a model.`;
  if (!isLlmConfigured()) return deterministic;

  const sampleFindings = proto.members
    .slice(0, 5)
    .flatMap((m) => m.signals.filter((s) => s.severity !== "green").slice(0, 2))
    .map((s) => `- [${s.signalCode}:${s.severity}] ${s.finding} (${s.sourceRef.dataset})`)
    .join("\n");
  const result = await generateStructured(
    assessmentComposer,
    [
      "Write the groupingRationale for one risk cluster: 2-3 sentences explaining, for an",
      "expert reviewer, WHY these properties sit together and what the shared pattern means.",
      "The grouping itself was computed deterministically — do not question or change it,",
      "and do not invent facts beyond the digest below.",
      "",
      `Cluster signature: ${proto.signature}`,
      `Members: ${proto.members.length}`,
      `Dominant sourced pattern: ${pattern}`,
      `Scope: ${proto.localAuthority ?? "all authorities"} / ${proto.propertyType ?? "all types"}`,
      "Sample sourced findings:",
      sampleFindings || "- (all green)",
      "",
      'Output JSON only: { "rationale": "..." }',
    ].join("\n"),
    rationaleSchema,
    { maxSteps: 1 },
  );
  return result.ok ? result.value.rationale : deterministic;
}

export interface ClusteringOptions {
  /** Groups smaller than this coalesce (signature tier, then COMPOUND). */
  minClusterSize?: number;
  /** Skip the LLM rationale pass (invariant tests want pure determinism). */
  withLlmRationale?: boolean;
}

/**
 * Compute the deterministic clusters over the given members. Pure function
 * of its input — exported for the "same input → same clusters" invariant.
 */
export function computeClusters(
  members: MemberInfo[],
  minClusterSize: number,
): ProtoCluster[] {
  // Tier 1 — group by signature.
  const bySignature = new Map<string, MemberInfo[]>();
  for (const m of members) {
    const list = bySignature.get(m.signature) ?? [];
    list.push(m);
    bySignature.set(m.signature, list);
  }

  const protos: ProtoCluster[] = [];
  const compound: MemberInfo[] = [];

  for (const [signature, group] of [...bySignature.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (group.length < minClusterSize) {
      compound.push(...group);
      continue;
    }
    // Tier 2 — the spec's full key (signature + localAuthority +
    // propertyType), applied only when it produces no dust clusters.
    const byExact = new Map<string, MemberInfo[]>();
    for (const m of group) {
      const key = `${m.property.localAuthority}|${m.property.propertyType}`;
      const list = byExact.get(key) ?? [];
      list.push(m);
      byExact.set(key, list);
    }
    const everySubgroupViable = [...byExact.values()].every(
      (sub) => sub.length >= minClusterSize,
    );
    if (everySubgroupViable && byExact.size > 1) {
      for (const [key, sub] of [...byExact.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const [localAuthority, propertyType] = key.split("|");
        protos.push({
          key: `${signature}|${key}`,
          signature,
          localAuthority: localAuthority ?? null,
          propertyType: propertyType ?? null,
          members: sub,
        });
      }
    } else {
      protos.push({
        key: signature,
        signature,
        localAuthority: null,
        propertyType: null,
        members: group,
      });
    }
  }

  if (compound.length > 0) {
    protos.push({
      key: COMPOUND_SIGNATURE,
      signature: COMPOUND_SIGNATURE,
      localAuthority: null,
      propertyType: null,
      members: compound,
    });
  }

  // Deterministic member order inside each cluster.
  for (const proto of protos) {
    proto.members.sort((a, b) => a.property.id.localeCompare(b.property.id));
  }
  return protos;
}

/** Load scan output and build MemberInfo for every clusterable property. */
export function loadClusterableMembers(): MemberInfo[] {
  return listProperties({ status: "signals_extracted" }).map((property) => {
    const signals = listSignalsForProperty(property.id);
    return { property, signals, signature: severitySignature(signals) };
  });
}

export async function clusterByRiskPattern(
  options: ClusteringOptions = {},
): Promise<RiskCluster[]> {
  const { minClusterSize = 40, withLlmRationale = true } = options;
  const members = loadClusterableMembers();
  if (members.length === 0) {
    logger.warn("No properties in signals_extracted — nothing to cluster");
    return [];
  }

  const protos = computeClusters(members, minClusterSize);
  const clusters: RiskCluster[] = [];

  for (const proto of protos) {
    const pattern = dominantPattern(proto.members);
    const { name, description } = describe(proto);
    const rationale = withLlmRationale
      ? await groupingRationale(proto, pattern)
      : `Deterministic signature group "${proto.signature}" (${proto.members.length} members).`;

    const cluster = upsertCluster({
      id: clusterId(proto.key),
      name,
      description,
      propertyIds: proto.members.map((m) => m.property.id),
      pattern,
      groupingRationale: rationale,
      proposedAssessment: null,
      proposedDisclosure: null,
      status: "draft",
      reviewedBy: null,
      reviewedAt: null,
    });
    clusters.push(cluster);

    for (const m of proto.members) updatePropertyStatus(m.property.id, "in_cluster");
    appendAuditEvent({
      actor: "agent",
      action: "cluster_formed",
      entityType: "RiskCluster",
      entityId: cluster.id,
      rationale:
        `Deterministic group-by formed "${cluster.name}" with ${proto.members.length} properties ` +
        `(signature ${proto.signature}; pattern ${pattern}). The model wrote only the rationale text.`,
      payloadSnapshot: { pattern, memberCount: proto.members.length },
    });
  }

  appendAuditEvent({
    actor: "agent",
    action: "portfolio_clustered",
    entityType: "RiskCluster",
    entityId: "portfolio",
    rationale: `clusterByRiskPattern complete: ${clusters.length} clusters over ${members.length} properties.`,
    payloadSnapshot: clusters.map((c) => ({ id: c.id, n: c.propertyIds.length })),
  });
  return clusters;
}

export type { MemberInfo, ProtoCluster };
