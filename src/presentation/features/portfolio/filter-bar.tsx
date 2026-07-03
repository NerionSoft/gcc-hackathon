"use client";

import { X } from "lucide-react";
import {
  capitalTypeSchema,
  dimensionCodeSchema,
  propertyStatusSchema,
  severitySchema,
  type CapitalType,
  type DimensionCode,
  type PropertyStatus,
  type Severity,
} from "@/db/schema";
import type { PortfolioTile } from "@/presentation/data/contracts";
import { DIMENSION_LABEL, STATUS_LABEL } from "@/presentation/ui/severity";
import { formatInt } from "@/presentation/ui/format";
import { cx } from "@/presentation/ui/cx";

export interface WallFilters {
  status: PropertyStatus | "all";
  dimension: DimensionCode | "all";
  severity: Severity | "all";
  localAuthority: string;
  capitalType: CapitalType | "all";
}

export const EMPTY_FILTERS: WallFilters = {
  status: "all",
  dimension: "all",
  severity: "all",
  localAuthority: "all",
  capitalType: "all",
};

export function applyFilters(
  tiles: PortfolioTile[],
  filters: WallFilters,
  statusOf: (tile: PortfolioTile) => PropertyStatus,
): PortfolioTile[] {
  return tiles.filter((tile) => {
    if (filters.status !== "all" && statusOf(tile) !== filters.status) return false;
    if (filters.severity !== "all" && tile.dominantSeverity !== filters.severity) return false;
    if (filters.dimension !== "all" && !tile.adverseDimensions.includes(filters.dimension))
      return false;
    if (filters.localAuthority !== "all" && tile.localAuthority !== filters.localAuthority)
      return false;
    if (filters.capitalType !== "all" && tile.capitalType !== filters.capitalType) return false;
    return true;
  });
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-ink-secondary">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cx(
          "rounded-(--radius-badge) border bg-surface px-1.5 py-1 text-[12px] text-ink outline-none focus:border-primary/50",
          value === "all" ? "border-line" : "border-primary/50",
        )}
      >
        {children}
      </select>
    </label>
  );
}

export function FilterBar({
  filters,
  onChange,
  localAuthorities,
  shownCount,
  totalCount,
}: {
  filters: WallFilters;
  onChange: (filters: WallFilters) => void;
  localAuthorities: string[];
  shownCount: number;
  totalCount: number;
}) {
  const active = Object.entries(filters).some(([, value]) => value !== "all");
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-2">
      <Select
        label="Status"
        value={filters.status}
        onChange={(v) =>
          onChange({ ...filters, status: v === "all" ? "all" : propertyStatusSchema.parse(v) })
        }
      >
        <option value="all">All</option>
        {propertyStatusSchema.options.map((status) => (
          <option key={status} value={status}>
            {STATUS_LABEL[status]}
          </option>
        ))}
      </Select>
      <Select
        label="Dimension"
        value={filters.dimension}
        onChange={(v) =>
          onChange({ ...filters, dimension: v === "all" ? "all" : dimensionCodeSchema.parse(v) })
        }
      >
        <option value="all">All</option>
        {dimensionCodeSchema.options.map((code) => (
          <option key={code} value={code}>
            {DIMENSION_LABEL[code]}
          </option>
        ))}
      </Select>
      <Select
        label="Severity"
        value={filters.severity}
        onChange={(v) =>
          onChange({ ...filters, severity: v === "all" ? "all" : severitySchema.parse(v) })
        }
      >
        <option value="all">All</option>
        {severitySchema.options.map((severity) => (
          <option key={severity} value={severity}>
            {severity[0].toUpperCase() + severity.slice(1)}
          </option>
        ))}
      </Select>
      <Select
        label="Authority"
        value={filters.localAuthority}
        onChange={(v) => onChange({ ...filters, localAuthority: v })}
      >
        <option value="all">All</option>
        {localAuthorities.map((authority) => (
          <option key={authority} value={authority}>
            {authority}
          </option>
        ))}
      </Select>
      <Select
        label="Capital"
        value={filters.capitalType}
        onChange={(v) =>
          onChange({ ...filters, capitalType: v === "all" ? "all" : capitalTypeSchema.parse(v) })
        }
      >
        <option value="all">All</option>
        {capitalTypeSchema.options.map((type) => (
          <option key={type} value={type}>
            {type[0].toUpperCase() + type.slice(1)}
          </option>
        ))}
      </Select>

      {active && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="flex items-center gap-1 rounded-(--radius-badge) px-1.5 py-1 text-[12px] font-medium text-primary hover:bg-primary/5"
        >
          <X aria-hidden className="h-3.5 w-3.5" strokeWidth={1.5} />
          Clear
        </button>
      )}

      <span className="ml-auto font-mono text-[12px] text-ink-secondary tabular-nums">
        {formatInt(shownCount)} / {formatInt(totalCount)} properties
      </span>
    </div>
  );
}
