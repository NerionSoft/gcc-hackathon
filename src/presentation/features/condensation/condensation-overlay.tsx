"use client";

import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import type { Severity } from "@/db/schema";
import type { ClusterCard as ClusterCardData } from "@/presentation/data/contracts";
import { ClusterCardFace, useTickingCount } from "@/presentation/features/condensation/cluster-card";
import { SEVERITY_META } from "@/presentation/ui/severity";

/**
 * F2 — the condensation, THE signature shot (~3.9s).
 *
 * The 60fps trick, since 2,800 animated DOM nodes would melt any frame budget:
 * only the tiles actually visible in the wall viewport (~150-250, captured as
 * rects by the caller) are animated — everything else is carried by the
 * cluster-card counters ticking up to the FULL member counts while the
 * visible tiles fly. Flights animate transform + opacity only (compositor
 * work); the one paint-phase animation (the severity tint) runs 0.45s per
 * tile, staggered. The wall itself is frozen invisible underneath.
 *
 * Timeline
 *   0.05–0.65  tint wave — tiles take their dominant-severity colour (top-left → bottom-right)
 *   0.75–1.45  the 9 cluster cards rise in
 *   1.15–3.65  tiles migrate to their cluster, shrinking to pills; counters tick to full counts
 *   3.90       onDone — the settled clusters grid takes over (layoutId FLIP)
 */

export interface CapturedTile {
  id: string;
  /** Rect in wall-area coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  address: string;
  /** null = out-of-scope: the tile fades out instead of migrating. */
  severity: Severity | null;
  /** Index into the clusters array; -1 fades out. */
  clusterIndex: number;
}

interface CardRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const TINT_DURATION = 0.45;
const CARDS_DELAY = 0.75;
const FLIGHT_START = 1.15;
const FLIGHT_SPREAD = 1.6;
const FLIGHT_DURATION = 0.9;
const TOTAL_MS = 3900;
const FLIGHT_EASE = [0.22, 0.9, 0.24, 1] as const;

export function CondensationOverlay({
  clusters,
  tiles,
  area,
  onDone,
}: {
  clusters: ClusterCardData[];
  tiles: CapturedTile[];
  area: { width: number; height: number };
  onDone: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDone, TOTAL_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

  const cardRects = useMemo(() => computeCardRects(clusters.length, area), [clusters.length, area]);

  const flightOrder = useMemo(() => {
    const flying = tiles.filter((t) => t.clusterIndex >= 0);
    flying.sort((a, b) => a.clusterIndex - b.clusterIndex || a.y - b.y || a.x - b.x);
    return new Map(flying.map((tile, index) => [tile.id, index / Math.max(1, flying.length - 1)]));
  }, [tiles]);

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {/* The 9 condensation targets — above the tiles so arrivals slide UNDER
          the card edge and read as absorption. */}
      <div className="absolute inset-0 z-20">
        {clusters.map((cluster, index) => (
          <CondensingCard
            key={cluster.id}
            cluster={cluster}
            rect={cardRects[index]}
            order={index}
          />
        ))}
      </div>

      {/* The migrating tiles */}
      {tiles.map((tile) => {
        const meta = tile.severity ? SEVERITY_META[tile.severity] : null;
        const tintDelay = 0.05 + (tile.y / Math.max(1, area.height)) * 0.4 + (tile.x / Math.max(1, area.width)) * 0.15;

        if (tile.clusterIndex < 0 || !meta) {
          // Out-of-scope: acknowledged, then quietly leaves the frame.
          return (
            <motion.div
              key={tile.id}
              className="absolute rounded-[4px] border border-dashed border-line bg-surface"
              style={{ left: tile.x, top: tile.y, width: tile.w, height: tile.h }}
              initial={{ opacity: 0.45 }}
              animate={{ opacity: 0 }}
              transition={{ delay: tintDelay + 0.5, duration: 0.6 }}
            />
          );
        }

        const target = cardRects[tile.clusterIndex];
        const jitter = jitterFor(tile.id);
        const dx = target.x + target.w / 2 + jitter.x * target.w * 0.3 - (tile.x + tile.w / 2);
        const dy = target.y + target.h * 0.62 + jitter.y * target.h * 0.16 - (tile.y + tile.h / 2);
        const flyDelay = FLIGHT_START + (flightOrder.get(tile.id) ?? 0) * FLIGHT_SPREAD;

        return (
          <motion.div
            key={tile.id}
            className="absolute overflow-hidden rounded-[4px] border px-2 py-1"
            style={{ left: tile.x, top: tile.y, width: tile.w, height: tile.h }}
            initial={{
              x: 0,
              y: 0,
              scale: 1,
              opacity: 1,
              backgroundColor: "#FFFFFF",
              borderColor: "#E5E5E0",
            }}
            animate={{
              x: dx,
              y: dy,
              scale: 0.14,
              opacity: 0,
              backgroundColor: meta.tint,
              borderColor: meta.color,
            }}
            transition={{
              backgroundColor: { delay: tintDelay, duration: TINT_DURATION },
              borderColor: { delay: tintDelay, duration: TINT_DURATION },
              x: { delay: flyDelay, duration: FLIGHT_DURATION, ease: [...FLIGHT_EASE] },
              y: { delay: flyDelay, duration: FLIGHT_DURATION, ease: [...FLIGHT_EASE] },
              scale: { delay: flyDelay, duration: FLIGHT_DURATION, ease: [...FLIGHT_EASE] },
              opacity: { delay: flyDelay + FLIGHT_DURATION - 0.22, duration: 0.22 },
            }}
          >
            <span className="block truncate text-[11px] leading-4 text-ink">{tile.address}</span>
          </motion.div>
        );
      })}

      {/* Cinematic caption, mono and sober */}
      <motion.div
        className="absolute bottom-2 left-1/2 -translate-x-1/2 font-mono text-[11px] text-ink-secondary"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: 3.4, times: [0, 0.15, 0.85, 1], delay: 0.5 }}
      >
        clustering by shared risk signature — deterministic group-by, no embeddings
      </motion.div>
    </div>
  );
}

function CondensingCard({
  cluster,
  rect,
  order,
}: {
  cluster: ClusterCardData;
  rect: CardRect;
  order: number;
}) {
  const count = useTickingCount(cluster.propertyCount, 1.3 + order * 0.06, 2.2);
  return (
    <motion.div
      layoutId={`cluster-${cluster.id}`}
      className="absolute"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: CARDS_DELAY + order * 0.06, duration: 0.5, ease: [0.22, 0.9, 0.24, 1] }}
    >
      <ClusterCardFace cluster={cluster} count={count} />
    </motion.div>
  );
}

/** 3×3 grid of card rects centred in the wall area. */
function computeCardRects(count: number, area: { width: number; height: number }): CardRect[] {
  const columns = 3;
  const rows = Math.ceil(count / columns);
  const gapX = 16;
  const gapY = 16;
  const cardW = Math.min(380, Math.max(240, (area.width - 32 - (columns - 1) * gapX) / columns));
  const cardH = Math.min(150, Math.max(120, (area.height - 24 - (rows - 1) * gapY) / rows));
  const gridW = columns * cardW + (columns - 1) * gapX;
  const gridH = rows * cardH + (rows - 1) * gapY;
  const offsetX = Math.max(8, (area.width - gridW) / 2);
  const offsetY = Math.max(8, (area.height - gridH) / 2);
  return Array.from({ length: count }, (_, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    return {
      x: offsetX + col * (cardW + gapX),
      y: offsetY + row * (cardH + gapY),
      w: cardW,
      h: cardH,
    };
  });
}

/** Deterministic per-tile jitter in [-1, 1]² so every take lands identically. */
function jitterFor(id: string): { x: number; y: number } {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const x = ((hash >>> 8) & 0xffff) / 0xffff;
  const y = ((hash >>> 16) & 0xffff) / 0xffff;
  return { x: x * 2 - 1, y: y * 2 - 1 };
}
