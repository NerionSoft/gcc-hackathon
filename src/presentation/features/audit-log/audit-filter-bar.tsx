"use client";

import { RotateCcw, X } from "lucide-react";
import { Button } from "@/presentation/ui/primitives/button";
import { cx } from "@/presentation/ui/cx";
import type { AuditFilters } from "@/presentation/features/audit-log/use-audit-log";
import type { AuditFacetsDTO } from "@/presentation/features/audit-log/contracts";

const FIELD_CLASS =
  "h-8 rounded-(--radius-badge) border border-line bg-surface px-2 text-[13px] text-ink " +
  "focus:border-primary/50 focus:outline-none";

const ACTOR_LABEL: Record<string, string> = {
  agent: "Agent",
  "user:nadia": "Nadia (reviewer)",
};

/** Turn "cluster_published" into "Cluster published" for the dropdown. */
function humanise(token: string): string {
  const spaced = token.replace(/[_:]/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-ink-secondary">
        {label}
      </span>
      {children}
    </label>
  );
}

export function AuditFilterBar({
  filters,
  facets,
  onChange,
  onReset,
  disabled,
}: {
  filters: AuditFilters;
  facets: AuditFacetsDTO;
  onChange: (filters: AuditFilters) => void;
  onReset: () => void;
  disabled?: boolean;
}) {
  const set = (patch: Partial<AuditFilters>) => onChange({ ...filters, ...patch });
  const active = Object.values(filters).some((value) => value !== "");

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-(--radius-card) border border-line bg-surface p-3">
      <Field label="Actor">
        <select
          className={cx(FIELD_CLASS, "min-w-40")}
          value={filters.actor}
          disabled={disabled}
          onChange={(e) => set({ actor: e.target.value })}
        >
          <option value="">All actors</option>
          {facets.actors.map((actor) => (
            <option key={actor} value={actor}>
              {ACTOR_LABEL[actor] ?? actor}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Action">
        <select
          className={cx(FIELD_CLASS, "min-w-52")}
          value={filters.action}
          disabled={disabled}
          onChange={(e) => set({ action: e.target.value })}
        >
          <option value="">All actions</option>
          {facets.actions.map((action) => (
            <option key={action} value={action}>
              {humanise(action)}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Entity type">
        <select
          className={cx(FIELD_CLASS, "min-w-44")}
          value={filters.entityType}
          disabled={disabled}
          onChange={(e) => set({ entityType: e.target.value })}
        >
          <option value="">All entities</option>
          {facets.entityTypes.map((entityType) => (
            <option key={entityType} value={entityType}>
              {entityType}
            </option>
          ))}
        </select>
      </Field>

      <Field label="From">
        <input
          type="datetime-local"
          className={cx(FIELD_CLASS, "font-mono text-[12px]")}
          value={filters.after}
          disabled={disabled}
          onChange={(e) => set({ after: e.target.value })}
        />
      </Field>

      <Field label="To">
        <input
          type="datetime-local"
          className={cx(FIELD_CLASS, "font-mono text-[12px]")}
          value={filters.before}
          disabled={disabled}
          onChange={(e) => set({ before: e.target.value })}
        />
      </Field>

      <Button
        variant="ghost"
        onClick={onReset}
        disabled={disabled || !active}
        className="mb-px"
        title="Clear all filters"
      >
        {active ? (
          <X aria-hidden className="h-3.5 w-3.5" />
        ) : (
          <RotateCcw aria-hidden className="h-3.5 w-3.5" />
        )}
        Clear
      </Button>
    </div>
  );
}
