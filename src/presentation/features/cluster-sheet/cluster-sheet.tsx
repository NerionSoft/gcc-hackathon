"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Loader2, PauseCircle } from "lucide-react";
import type { ClusterStatus, RiskSignal } from "@/db/schema";
import { fetchClusterDetail, reviewCluster } from "@/presentation/data/api";
import type { ClusterDetailResponse, ClusterMember } from "@/presentation/data/contracts";
import { NeutralBadge, SeverityBadge } from "@/presentation/ui/primitives/badge";
import { Button } from "@/presentation/ui/primitives/button";
import { Card, CardBody, CardHeader } from "@/presentation/ui/primitives/card";
import { ConfidenceMeter } from "@/presentation/ui/primitives/confidence-meter";
import { Markdown } from "@/presentation/ui/primitives/markdown";
import { SourceLink } from "@/presentation/ui/primitives/source-link";
import { StatusPill } from "@/presentation/ui/primitives/status-pill";
import { SEVERITY_ORDER } from "@/presentation/ui/severity";
import { formatInt, formatTimestamp } from "@/presentation/ui/format";

const CLUSTER_STATUS_LABEL: Record<ClusterStatus, string> = {
  draft: "Draft",
  pending_review: "Pending review",
  approved: "Approved",
  published: "Published",
  completed: "Completed",
};

/**
 * F3 — cluster sheet & review gate. Shows the grouping rationale, the assessment
 * and plain-language disclosure, and the evidence view (every finding beside its
 * clickable public-record source). The reviewer approves or requests changes;
 * approval drives the suspended workflow's resume() → publishCluster, which is
 * hard-gated on reviewedAt. No control here publishes an unreviewed cluster.
 */
export function ClusterSheet({ clusterId }: { clusterId: string }) {
  const [detail, setDetail] = useState<ClusterDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<null | "approve" | "request_changes">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    return fetchClusterDetail(clusterId)
      .then(setDetail)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load the cluster"),
      );
  }, [clusterId]);

  useEffect(() => {
    let cancelled = false;
    fetchClusterDetail(clusterId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load the cluster");
      });
    return () => {
      cancelled = true;
    };
  }, [clusterId]);

  const submit = useCallback(
    async (decision: "approve" | "request_changes") => {
      if (decision === "request_changes" && comment.trim().length === 0) {
        setActionError("Add a comment describing the changes you need.");
        return;
      }
      setBusy(decision);
      setActionError(null);
      setNotice(null);
      try {
        await reviewCluster(clusterId, decision, comment.trim() || undefined);
        setComment("");
        setNotice(
          decision === "approve"
            ? "Assessment approved — the agent has published this cluster and opened its adjudications."
            : "Changes requested — the agent re-composed the assessment from the evidence.",
        );
        await load();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "The review action failed.");
      } finally {
        setBusy(null);
      }
    },
    [clusterId, comment, load],
  );

  if (error) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card>
          <CardBody className="flex items-start gap-3">
            <AlertTriangle
              aria-hidden
              className="mt-0.5 h-4 w-4 shrink-0 text-severity-red"
              strokeWidth={1.5}
            />
            <div>
              <p className="text-[13px] font-medium text-ink">This cluster could not be loaded.</p>
              <p className="mt-1 font-mono text-[12px] text-ink-secondary">{error}</p>
              <Link
                href="/clusters"
                className="mt-2 inline-block text-[13px] text-primary underline"
              >
                Back to clusters
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="mx-auto max-w-6xl space-y-3 py-6">
        <div className="h-8 w-64 animate-pulse rounded bg-surface" />
        <div className="h-24 animate-pulse rounded-(--radius-card) border border-line bg-surface" />
        <div className="h-64 animate-pulse rounded-(--radius-card) border border-line bg-surface" />
      </div>
    );
  }

  const { cluster, memberCount, members } = detail;
  const awaitingReview = cluster.status === "pending_review" || cluster.status === "draft";
  const reviewed = cluster.reviewedAt !== null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 py-2">
      <Link
        href="/clusters"
        className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline"
      >
        <ArrowLeft aria-hidden className="h-3.5 w-3.5" strokeWidth={1.5} />
        All clusters
      </Link>

      {/* Identity */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-ink">{cluster.name}</h1>
            <NeutralBadge>{CLUSTER_STATUS_LABEL[cluster.status]}</NeutralBadge>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 font-mono text-[12px] text-ink-secondary">
            <span className="text-ink">{cluster.pattern}</span>
            <span>{formatInt(memberCount)} properties</span>
            <span>id {cluster.id}</span>
          </p>
        </div>
      </div>

      {/* Review gate */}
      {awaitingReview ? (
        <Card className="border-primary/40">
          <CardBody className="space-y-3">
            <div className="flex items-start gap-3">
              <PauseCircle
                aria-hidden
                className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                strokeWidth={1.5}
              />
              <div>
                <p className="text-[14px] font-semibold text-primary">
                  The agent is waiting for your review
                </p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-secondary">
                  Nothing is published until a named reviewer approves. Approve to publish this
                  cluster and open its adjudications, or request changes with a comment — the agent
                  re-composes the assessment strictly from the sourced evidence.
                </p>
              </div>
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Reviewer comment (required to request changes; optional to approve)…"
              rows={2}
              className="w-full resize-y rounded-(--radius-badge) border border-line bg-background px-3 py-2 text-[13px] text-ink placeholder:text-ink-secondary focus:border-primary/50 focus:outline-none"
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                onClick={() => submit("approve")}
                disabled={busy !== null}
                data-testid="approve-cluster"
              >
                {busy === "approve" ? (
                  <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={1.5} />
                )}
                Approve &amp; publish
              </Button>
              <Button
                variant="secondary"
                onClick={() => submit("request_changes")}
                disabled={busy !== null}
              >
                {busy === "request_changes" ? (
                  <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                ) : null}
                Request changes
              </Button>
              {actionError && (
                <span className="font-mono text-[11px] text-severity-red">{actionError}</span>
              )}
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card className="border-line">
          <CardBody className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <CheckCircle2
              aria-hidden
              className="h-4 w-4 shrink-0 text-severity-green"
              strokeWidth={1.5}
            />
            <span className="text-[13px] font-medium text-ink">
              {cluster.status === "published" || cluster.status === "completed"
                ? "Published after review"
                : "Approved"}
            </span>
            {reviewed && (
              <span className="font-mono text-[12px] text-ink-secondary">
                by {cluster.reviewedBy} · {formatTimestamp(cluster.reviewedAt!)}
              </span>
            )}
            <Link href="/adjudication" className="ml-auto text-[13px] text-primary hover:underline">
              View adjudications →
            </Link>
          </CardBody>
        </Card>
      )}

      {notice && (
        <p className="rounded-(--radius-badge) border border-line bg-background px-3 py-2 text-[12px] text-ink-secondary">
          {notice}
        </p>
      )}

      {/* Grouping rationale */}
      <Card>
        <CardHeader title="Why these properties are grouped" />
        <CardBody>
          <p className="text-[13px] leading-relaxed text-ink">{cluster.groupingRationale}</p>
          <p className="mt-2 text-[12px] text-ink-secondary">{cluster.description}</p>
        </CardBody>
      </Card>

      {/* Plain-language disclosure */}
      <Card>
        <CardHeader
          title="Plain-language disclosure"
          aside={<NeutralBadge>for a non-expert reader</NeutralBadge>}
        />
        <CardBody>
          {cluster.proposedDisclosure ? (
            <Markdown source={cluster.proposedDisclosure} />
          ) : (
            <p className="text-[13px] text-ink-secondary">No disclosure composed yet.</p>
          )}
        </CardBody>
      </Card>

      {/* Assessment */}
      <Card>
        <CardHeader title="Risk assessment" />
        <CardBody>
          {cluster.proposedAssessment ? (
            <Markdown source={cluster.proposedAssessment} />
          ) : (
            <p className="text-[13px] text-ink-secondary">No assessment composed yet.</p>
          )}
        </CardBody>
      </Card>

      {/* Evidence view — every finding beside its cited source */}
      <Card>
        <CardHeader
          title="Evidence view"
          aside={
            <NeutralBadge>
              {members.length < memberCount
                ? `${formatInt(members.length)} of ${formatInt(memberCount)} members`
                : `${formatInt(memberCount)} members · every finding sourced`}
            </NeutralBadge>
          }
        />
        <CardBody className="p-0">
          <ul className="divide-y divide-line">
            {members.map((member, index) => (
              <MemberEvidence key={member.property?.id ?? `member-${index}`} member={member} />
            ))}
          </ul>
          {members.length < memberCount && (
            <p className="border-t border-line px-4 py-2.5 text-[12px] text-ink-secondary">
              Showing the evidence for the first {formatInt(members.length)} members. Every one of
              the {formatInt(memberCount)} properties shares the same sourced signature.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function MemberEvidence({ member }: { member: ClusterMember }) {
  const { property, signals } = member;
  const sorted = [...signals].sort(
    (a, b) =>
      SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] ||
      a.signalCode.localeCompare(b.signalCode),
  );
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {property ? (
          <>
            <Link
              href={`/property/${encodeURIComponent(property.id)}`}
              className="text-[13px] font-medium text-ink hover:text-primary hover:underline"
            >
              {property.address}
            </Link>
            <StatusPill status={property.status} />
            <span className="font-mono text-[11px] text-ink-secondary">{property.postcode}</span>
            <span className="font-mono text-[11px] text-ink-secondary">
              {property.localAuthority}
            </span>
          </>
        ) : (
          <span className="text-[13px] text-ink-secondary">Unknown property</span>
        )}
      </div>
      {sorted.length === 0 ? (
        <p className="mt-1 text-[12px] text-ink-secondary">No stored signals for this property.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {sorted.map((signal) => (
            <EvidenceRow key={signal.id} signal={signal} />
          ))}
        </ul>
      )}
    </li>
  );
}

function EvidenceRow({ signal }: { signal: RiskSignal }) {
  return (
    <li className="grid gap-2 rounded-(--radius-badge) border border-line bg-background px-3 py-2 md:grid-cols-[1fr_auto] md:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={signal.severity} />
          <span className="font-mono text-[11px] text-ink-secondary">{signal.signalCode}</span>
          <ConfidenceMeter value={signal.confidence} />
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-ink">{signal.finding}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-ink-secondary">{signal.rationale}</p>
      </div>
      {/* The cited public record, right beside its finding — clickable. */}
      <div className="md:pt-0.5">
        <SourceLink sourceRef={signal.sourceRef} showRetrievedAt />
      </div>
    </li>
  );
}
