"use client";

import { memo } from "react";
import type { PropertyStatus } from "@/db/schema";
import type { PortfolioTile } from "@/presentation/data/contracts";
import { SEVERITY_META } from "@/presentation/ui/severity";
import { cx } from "@/presentation/ui/cx";

export const TILE_HEIGHT = 52;
export const TILE_MIN_WIDTH = 150;
export const TILE_GAP = 6;

/**
 * One property on the wall. 2,800 of these exist logically but only the
 * virtualized viewport renders; state changes are pure CSS (no per-tile JS
 * animation) so the scan sweep stays cheap.
 */
export const Tile = memo(function Tile({
  tile,
  status,
  onOpen,
}: {
  tile: PortfolioTile;
  status: PropertyStatus;
  onOpen: (id: string) => void;
}) {
  const revealed = status !== "unscanned" && status !== "scanning" && status !== "out_of_scope";
  const severity = revealed ? tile.dominantSeverity : null;
  const meta = severity ? SEVERITY_META[severity] : null;

  return (
    <button
      type="button"
      data-tile-id={tile.id}
      data-severity={severity ?? "none"}
      onClick={() => onOpen(tile.id)}
      title={`${tile.address}, ${tile.postcode} — ${tile.localAuthority}`}
      className={cx(
        "relative block h-full w-full overflow-hidden rounded-[4px] border bg-surface px-2 py-1 text-left transition-colors duration-300",
        status === "unscanned" && "border-line",
        status === "scanning" && "tile-scanning border-primary/60",
        status === "out_of_scope" && "border-dashed border-line opacity-45",
        revealed && "border-line hover:border-primary/50",
      )}
      style={meta ? { borderLeft: `3px solid ${meta.color}` } : undefined}
    >
      <span
        className={cx(
          "block truncate text-[11px] leading-4",
          status === "unscanned" ? "text-ink-secondary" : "text-ink",
        )}
      >
        {tile.address}
      </span>
      <span className="flex items-center justify-between gap-1">
        <span className="truncate font-mono text-[10px] leading-4 text-ink-secondary">
          {tile.postcode}
        </span>
        {revealed && tile.signalCount > 0 && (
          <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] leading-4">
            {tile.redCount > 0 && (
              <span style={{ color: SEVERITY_META.red.color }}>{tile.redCount}R</span>
            )}
            {tile.amberCount > 0 && (
              <span style={{ color: SEVERITY_META.amber.color }}>{tile.amberCount}A</span>
            )}
            {tile.redCount === 0 && tile.amberCount === 0 && (
              <span style={{ color: SEVERITY_META.green.color }}>ok</span>
            )}
          </span>
        )}
        {status === "scanning" && (
          <span className="shrink-0 font-mono text-[10px] leading-4 text-primary">…</span>
        )}
      </span>
    </button>
  );
});
