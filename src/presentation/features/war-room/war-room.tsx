"use client";

import { useMemo } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { AlertTriangle, Info } from "lucide-react";
import type { AdjudicationStatus } from "@/db/schema";
import type { AdjudicationBoardItem } from "@/presentation/data/contracts";
import { useWarRoom } from "@/presentation/features/war-room/use-war-room";
import { FeedControls } from "@/presentation/features/war-room/feed-controls";
import { EscalatedCase } from "@/presentation/features/war-room/escalated-case";
import { NeutralBadge, SeverityBadge } from "@/presentation/ui/primitives/badge";
import { Card, CardBody, CardHeader } from "@/presentation/ui/primitives/card";
import { SEVERITY_META } from "@/presentation/ui/severity";
import { formatInt } from "@/presentation/ui/format";
import { cx } from "@/presentation/ui/cx";

const STATUS_LABEL: Record<AdjudicationStatus, string> = {
  queued: "Queued",
  assessing: "Assessing",
  monitoring: "Monitoring",
  evidence_received: "Evidence received",
  adjudicated: "Confirmed risk",
  resolved: "Resolved",
  escalated: "Escalated",
};

interface ColumnDef {
  key: string;
  title: string;
  statuses: readonly AdjudicationStatus[];
}

const COLUMNS: readonly ColumnDef[] = [
  {
    key: "monitoring",
    title: "Monitoring",
    statuses: ["queued", "assessing", "monitoring", "evidence_received"],
  },
  { key: "adjudicated", title: "Confirmed risk", statuses: ["adjudicated"] },
  { key: "resolved", title: "Resolved", statuses: ["resolved"] },
  { key: "escalated", title: "Escalated", statuses: ["escalated"] },
];

/** Cards rendered per column before collapsing to a "+N more" note. */
const COLUMN_CAP = 18;

export function WarRoom() {
  const { items, atHumanGate, simulator, recentlyUpdated, error, refresh } = useWarRoom();

  const byColumn = useMemo(() => {
    const map = new Map<string, AdjudicationBoardItem[]>();
    for (const col of COLUMNS) map.set(col.key, []);
    for (const item of items ?? []) {
      const col = COLUMNS.find((c) => c.statuses.includes(item.status));
      if (col) map.get(col.key)!.push(item);
    }
    return map;
  }, [items]);

  const escalated = byColumn.get("escalated") ?? [];

  if (error && !items) {
    return (
      <Card className="mx-auto mt-10 max-w-lg">
        <CardBody className="flex items-start gap-3">
          <AlertTriangle
            aria-hidden
            className="mt-0.5 h-4 w-4 shrink-0 text-severity-red"
            strokeWidth={1.5}
          />
          <p className="font-mono text-[12px] text-ink-secondary">{error}</p>
        </CardBody>
      </Card>
    );
  }

  const total = items?.length ?? 0;

  return (
    <div className="space-y-4 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[15px] font-semibold tracking-tight text-primary">
          Adjudication war room
        </h1>
        <span className="font-mono text-[12px] text-ink-secondary tabular-nums">
          {formatInt(total)} adjudications
        </span>
        <div className="ml-auto">
          <FeedControls simulator={simulator} onChange={refresh} />
        </div>
      </div>

      {total === 0 ? (
        <Card>
          <CardBody className="flex items-start gap-3">
            <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.5} />
            <p className="text-[13px] leading-relaxed text-ink-secondary">
              No adjudications yet. Run the portfolio scan, then open a cluster and approve its
              assessment — publishing a cluster opens an adjudication per property, and they appear
              here. The evidence feed then streams open-data updates that reclassify these cards
              live.
            </p>
          </CardBody>
        </Card>
      ) : (
        <>
          {/* Board — cards animate between columns as verdicts reclassify. */}
          <LayoutGroup>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {COLUMNS.map((col) => {
                const cards = byColumn.get(col.key) ?? [];
                const shown = cards.slice(0, COLUMN_CAP);
                return (
                  <div key={col.key} className="flex min-w-0 flex-col">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-secondary">
                        {col.title}
                      </h2>
                      <span className="font-mono text-[11px] text-ink-secondary tabular-nums">
                        {formatInt(cards.length)}
                      </span>
                    </div>
                    <div className="flex min-h-[60px] flex-col gap-2 rounded-(--radius-card) border border-line bg-background/60 p-2">
                      <AnimatePresence initial={false}>
                        {shown.map((item) => (
                          <BoardCard
                            key={item.id}
                            item={item}
                            fresh={recentlyUpdated.has(item.id)}
                          />
                        ))}
                      </AnimatePresence>
                      {cards.length > shown.length && (
                        <p className="px-1 py-1 font-mono text-[11px] text-ink-secondary">
                          +{formatInt(cards.length - shown.length)} more
                        </p>
                      )}
                      {cards.length === 0 && (
                        <p className="px-1 py-2 text-center text-[11px] text-ink-secondary">—</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </LayoutGroup>

          {/* Escalated to analyst — the queue with expert actions. */}
          <Card>
            <CardHeader
              title="Escalated to analyst"
              aside={
                <NeutralBadge>
                  {formatInt(escalated.length)} awaiting a decision
                  {atHumanGate ? " · workflow suspended" : ""}
                </NeutralBadge>
              }
            />
            <CardBody className="p-0">
              {escalated.length === 0 ? (
                <p className="px-4 py-4 text-[13px] text-ink-secondary">
                  No case is currently escalated. Red verdicts land here for a human decision — they
                  are never auto-resolved.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {escalated.slice(0, 25).map((item) => (
                    <EscalatedCase
                      key={item.id}
                      item={item}
                      fresh={recentlyUpdated.has(item.id)}
                      onDone={refresh}
                    />
                  ))}
                </ul>
              )}
              {escalated.length > 25 && (
                <p className="border-t border-line px-4 py-2.5 font-mono text-[11px] text-ink-secondary">
                  Showing the 25 most recently active of {formatInt(escalated.length)} escalated
                  cases.
                </p>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

function BoardCard({ item, fresh }: { item: AdjudicationBoardItem; fresh: boolean }) {
  const meta = item.compositeVerdict ? SEVERITY_META[item.compositeVerdict] : null;
  return (
    <motion.div
      layout
      layoutId={item.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{
        opacity: 1,
        y: 0,
        boxShadow: fresh ? `0 0 0 2px ${meta?.color ?? "#1B2A4A"}` : "0 0 0 0 rgba(0,0,0,0)",
      }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{
        layout: { duration: 0.5, ease: [0.22, 0.9, 0.24, 1] },
        boxShadow: { duration: 0.4 },
      }}
      className={cx(
        "rounded-(--radius-badge) border border-line bg-surface px-2.5 py-2 shadow-(--shadow-card)",
      )}
      style={meta ? { borderLeft: `3px solid ${meta.color}` } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[12px] font-medium text-ink" title={item.address}>
          {item.address}
        </span>
        {item.compositeVerdict ? (
          <SeverityBadge severity={item.compositeVerdict} />
        ) : (
          <NeutralBadge>pending</NeutralBadge>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span
          className="truncate font-mono text-[10px] text-ink-secondary"
          title={item.clusterName}
        >
          {item.clusterName}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-ink-secondary">
          {STATUS_LABEL[item.status]}
        </span>
      </div>
      {item.latestEvidence && (
        <p className="mt-1 truncate text-[11px] text-ink-secondary" title={item.latestEvidence}>
          ↳ {item.latestEvidence}
        </p>
      )}
    </motion.div>
  );
}
