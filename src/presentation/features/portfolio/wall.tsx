"use client";

import { useEffect, useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { PropertyStatus } from "@/db/schema";
import type { PortfolioTile } from "@/presentation/data/contracts";
import {
  Tile,
  TILE_GAP,
  TILE_HEIGHT,
  TILE_MIN_WIDTH,
} from "@/presentation/features/portfolio/tile";
import { cx } from "@/presentation/ui/cx";

/**
 * F1 acceptance criterion: ~2,800 tiles with zero jank. Rows are virtualized
 * with @tanstack/react-virtual (only the viewport's ~15 rows exist in the
 * DOM); columns are computed from the container width so the grid stays dense
 * at any viewport.
 */
export function Wall({
  tiles,
  statusOf,
  onOpen,
  hidden = false,
  scrollRef,
}: {
  tiles: PortfolioTile[];
  statusOf: (tile: PortfolioTile) => PropertyStatus;
  onOpen: (id: string) => void;
  /** During the condensation overlay the real wall stays mounted but invisible. */
  hidden?: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollRef]);

  const columns = Math.max(3, Math.floor((width + TILE_GAP) / (TILE_MIN_WIDTH + TILE_GAP)));
  const rowCount = Math.ceil(tiles.length / columns);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TILE_HEIGHT + TILE_GAP,
    overscan: 8,
  });

  const rows = virtualizer.getVirtualItems();
  const tileWidth = useMemo(
    () => (width > 0 ? (width - (columns - 1) * TILE_GAP) / columns : TILE_MIN_WIDTH),
    [width, columns],
  );

  return (
    <div
      ref={scrollRef}
      className={cx("flex-1 overflow-y-auto", hidden && "invisible")}
      data-wall-root
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {rows.map((row) => {
          const start = row.index * columns;
          const rowTiles = tiles.slice(start, start + columns);
          return (
            <div
              key={row.key}
              className="absolute left-0 top-0 flex w-full"
              style={{
                transform: `translateY(${row.start}px)`,
                gap: TILE_GAP,
                height: TILE_HEIGHT,
              }}
            >
              {rowTiles.map((tile) => (
                <div key={tile.id} style={{ width: tileWidth, height: TILE_HEIGHT }}>
                  <Tile tile={tile} status={statusOf(tile)} onOpen={onOpen} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
