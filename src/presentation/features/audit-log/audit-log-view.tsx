"use client";

import { Bot, ChevronLeft, ChevronRight, ShieldCheck, User } from "lucide-react";
import type { AuditEvent } from "@/db/schema";
import { DataTable, type DataTableColumn } from "@/presentation/ui/primitives/data-table";
import { NeutralBadge } from "@/presentation/ui/primitives/badge";
import { Button } from "@/presentation/ui/primitives/button";
import { SourceLink } from "@/presentation/ui/primitives/source-link";
import { formatTimestamp } from "@/presentation/ui/format";
import { cx } from "@/presentation/ui/cx";
import { AuditFilterBar } from "@/presentation/features/audit-log/audit-filter-bar";
import { ExportPdfButton } from "@/presentation/features/audit-log/export-pdf-button";
import { extractSourceRef } from "@/presentation/features/audit-log/contracts";
import { EMPTY_FACETS, useAuditLog } from "@/presentation/features/audit-log/use-audit-log";

function ActorTag({ actor }: { actor: AuditEvent["actor"] }) {
  const isHuman = actor === "user:nadia";
  const Icon = isHuman ? User : Bot;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap font-mono text-[11px]",
        isHuman ? "text-primary" : "text-ink-secondary",
      )}
    >
      <Icon aria-hidden className="h-3 w-3" strokeWidth={1.5} />
      {isHuman ? "nadia" : "agent"}
    </span>
  );
}

const COLUMNS: ReadonlyArray<DataTableColumn<AuditEvent>> = [
  {
    key: "timestamp",
    header: "Timestamp",
    className: "w-44 font-mono text-[12px] whitespace-nowrap text-ink-secondary",
    render: (e) => formatTimestamp(e.timestamp),
  },
  {
    key: "actor",
    header: "Actor",
    className: "w-28",
    render: (e) => <ActorTag actor={e.actor} />,
  },
  {
    key: "action",
    header: "Action",
    className: "w-52",
    render: (e) => <NeutralBadge>{e.action}</NeutralBadge>,
  },
  {
    key: "entity",
    header: "Entity",
    className: "w-44",
    render: (e) => (
      <span className="flex flex-col gap-0.5">
        <span className="text-[12px] text-ink">{e.entityType}</span>
        <span className="font-mono text-[11px] text-ink-secondary">{e.entityId}</span>
      </span>
    ),
  },
  {
    key: "rationale",
    header: "Rationale",
    className: "min-w-64",
    render: (e) => <span className="block text-[13px] leading-snug text-ink">{e.rationale}</span>,
  },
  {
    key: "source",
    header: "Source",
    className: "w-56",
    render: (e) => {
      const sourceRef = extractSourceRef(e.payloadSnapshot);
      return sourceRef ? (
        <SourceLink sourceRef={sourceRef} showRetrievedAt />
      ) : (
        <span
          className="font-mono text-[11px] text-ink-secondary"
          title="No source snapshot on this event"
        >
          —
        </span>
      );
    },
  },
];

export function AuditLogView() {
  const { data, loading, error, page, filters, setPage, setFilters, resetFilters, refresh } =
    useAuditLog();

  const facets = data?.facets ?? EMPTY_FACETS;
  const total = data?.total ?? 0;
  const pageCount = data?.pageCount ?? 0;
  const events = data?.events ?? [];
  const rangeStart = total === 0 ? 0 : (page - 1) * (data?.pageSize ?? 25) + 1;
  const rangeEnd = Math.min(page * (data?.pageSize ?? 25), total);

  return (
    <div className="space-y-4 py-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight text-primary">
            Audit log · provenance ledger
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-secondary">
            <ShieldCheck
              aria-hidden
              className="h-3.5 w-3.5 text-severity-green"
              strokeWidth={1.5}
            />
            Append-only. Every agent and human action, with its rationale and the public record
            behind it — any verdict traces back to source.
          </p>
        </div>
        <ExportPdfButton total={total} />
      </div>

      <AuditFilterBar
        filters={filters}
        facets={facets}
        onChange={setFilters}
        onReset={resetFilters}
        disabled={loading && !data}
      />

      {error ? (
        <div className="rounded-(--radius-card) border border-line bg-surface p-6 text-center text-[13px] text-severity-red">
          {error}
          <div className="mt-2">
            <Button variant="secondary" onClick={refresh}>
              Retry
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[12px] text-ink-secondary tabular-nums">
              {loading && !data
                ? "Loading ledger…"
                : `${rangeStart.toLocaleString("en-GB")}–${rangeEnd.toLocaleString("en-GB")} of ${total.toLocaleString("en-GB")} events`}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                onClick={() => setPage(page - 1)}
                disabled={page <= 1 || loading}
                aria-label="Previous page"
              >
                <ChevronLeft aria-hidden className="h-3.5 w-3.5" />
              </Button>
              <span className="min-w-24 text-center font-mono text-[12px] text-ink-secondary tabular-nums">
                page {page} / {Math.max(pageCount, 1)}
              </span>
              <Button
                variant="secondary"
                onClick={() => setPage(page + 1)}
                disabled={page >= pageCount || loading}
                aria-label="Next page"
              >
                <ChevronRight aria-hidden className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className={cx("transition-opacity", loading && "opacity-60")}>
            <DataTable
              columns={COLUMNS}
              rows={events}
              rowKey={(e) => e.id}
              emptyMessage={
                loading ? "Loading ledger…" : "No audit events match the current filters."
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
