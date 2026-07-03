"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGroup, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { usePortfolioData } from "@/presentation/features/portfolio/use-portfolio-data";
import { useCampaignScan } from "@/presentation/features/portfolio/use-campaign-scan";
import {
  applyFilters,
  EMPTY_FILTERS,
  FilterBar,
  type WallFilters,
} from "@/presentation/features/portfolio/filter-bar";
import { ContextBand } from "@/presentation/features/portfolio/context-band";
import { Wall } from "@/presentation/features/portfolio/wall";
import {
  CondensationOverlay,
  type CapturedTile,
} from "@/presentation/features/condensation/condensation-overlay";
import { ClusterCardFace } from "@/presentation/features/condensation/cluster-card";
import { NeutralBadge } from "@/presentation/ui/primitives/badge";
import { Card, CardBody } from "@/presentation/ui/primitives/card";
import { cx } from "@/presentation/ui/cx";

type Stage = "wall" | "condensing" | "clusters";

/** Cap on simultaneously animated tiles — see CondensationOverlay's 60fps note. */
const MAX_ANIMATED_TILES = 260;

export function PortfolioView() {
  const router = useRouter();
  const { tiles, summary, clusters, error, refetchClusters } = usePortfolioData();
  // A prior campaign that persisted real clusters means the portfolio is
  // already scanned — jump straight to the settled wall.
  const initialComplete = clusters ? !clusters.preview : false;
  const sim = useCampaignScan(tiles, { initialComplete, onComplete: refetchClusters });
  const { statusOf } = sim;

  const openCluster = useCallback(
    (id: string) => router.push(`/clusters/${encodeURIComponent(id)}`),
    [router],
  );
  const [filters, setFilters] = useState<WallFilters>(EMPTY_FILTERS);
  const [stage, setStage] = useState<Stage>("wall");
  const [captured, setCaptured] = useState<CapturedTile[]>([]);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [take, setTake] = useState(0);
  const wallAreaRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const tileById = useMemo(() => new Map((tiles ?? []).map((tile) => [tile.id, tile])), [tiles]);

  const clusterIndexById = useMemo(() => {
    const map = new Map<string, number>();
    clusters?.clusters.forEach((cluster, index) => {
      for (const id of cluster.propertyIds) map.set(id, index);
    });
    return map;
  }, [clusters]);

  const filtered = useMemo(
    () => (tiles ? applyFilters(tiles, filters, statusOf) : []),
    [tiles, filters, statusOf],
  );

  const openProperty = useCallback(
    (id: string) => router.push(`/property/${encodeURIComponent(id)}`),
    [router],
  );

  /** Snapshot the visible tiles' rects — the condensation animates these clones. */
  const captureVisibleTiles = useCallback((): boolean => {
    const wallArea = wallAreaRef.current;
    if (!wallArea) return false;
    const origin = wallArea.getBoundingClientRect();
    const nodes = wallArea.querySelectorAll<HTMLElement>("[data-tile-id]");
    const snapshot: CapturedTile[] = [];
    nodes.forEach((node) => {
      const id = node.dataset.tileId;
      const tile = id ? tileById.get(id) : undefined;
      if (!tile) return;
      const rect = node.getBoundingClientRect();
      if (rect.bottom < origin.top - 4 || rect.top > origin.bottom + 4) return;
      const outOfScope = statusOf(tile) === "out_of_scope";
      snapshot.push({
        id: tile.id,
        x: rect.left - origin.left,
        y: rect.top - origin.top,
        w: rect.width,
        h: rect.height,
        address: tile.address,
        severity: outOfScope ? null : tile.dominantSeverity,
        clusterIndex: outOfScope ? -1 : (clusterIndexById.get(tile.id) ?? -1),
      });
    });
    if (snapshot.length === 0) return false;
    setCaptured(snapshot.slice(0, MAX_ANIMATED_TILES));
    setArea({ width: wallArea.clientWidth, height: wallArea.clientHeight });
    return true;
  }, [tileById, clusterIndexById, statusOf]);

  const startCondensation = useCallback(() => {
    if (!clusters || clusters.clusters.length === 0) return;
    if (!captureVisibleTiles()) return;
    setTake((t) => t + 1);
    setStage("condensing");
  }, [clusters, captureVisibleTiles]);

  const resetAll = useCallback(() => {
    sim.reset();
    setStage("wall");
    setCaptured([]);
  }, [sim]);

  // Hidden replay for filming (phase brief §3): Shift+R re-runs the shot
  // from the same captured frame — deterministic, identical every take.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.shiftKey || event.key.toLowerCase() !== "r") return;
      const editable = (event.target as HTMLElement | null)?.closest("input, textarea, select");
      if (editable) return;
      if (stage === "clusters" && captured.length > 0) {
        event.preventDefault();
        setTake((t) => t + 1);
        setStage("condensing");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stage, captured]);

  if (error) {
    return (
      <Card className="mx-auto mt-10 max-w-lg">
        <CardBody className="flex items-start gap-3">
          <AlertTriangle
            aria-hidden
            className="mt-0.5 h-4 w-4 shrink-0 text-severity-red"
            strokeWidth={1.5}
          />
          <div>
            <p className="text-[13px] font-medium text-ink">The portfolio failed to load.</p>
            <p className="mt-1 font-mono text-[12px] text-ink-secondary">{error}</p>
            <p className="mt-2 text-[12px] text-ink-secondary">
              Is the database seeded? Run <code className="font-mono">pnpm seed</code> and reload.
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (!tiles || !summary || !clusters) {
    return <WallSkeleton />;
  }

  return (
    <div className="flex h-[calc(100vh-8.5rem)] min-h-[480px] flex-col gap-2">
      <ContextBand
        summary={summary}
        counters={sim.counters}
        phase={sim.phase}
        condensed={stage !== "wall"}
        onRunScan={sim.start}
        onCluster={startCondensation}
        onReset={resetAll}
      />

      {stage === "wall" && (
        <FilterBar
          filters={filters}
          onChange={setFilters}
          localAuthorities={summary.localAuthorities}
          shownCount={filtered.length}
          totalCount={tiles.length}
        />
      )}

      <LayoutGroup>
        <div ref={wallAreaRef} className="relative flex min-h-0 flex-1 flex-col">
          {filtered.length === 0 && stage === "wall" ? (
            <p className="py-10 text-center text-[13px] text-ink-secondary">
              No properties match the current filters.
            </p>
          ) : (
            <Wall
              tiles={filtered}
              statusOf={statusOf}
              onOpen={openProperty}
              hidden={stage !== "wall"}
              scrollRef={scrollRef}
            />
          )}

          {stage === "condensing" && (
            <CondensationOverlay
              key={take}
              clusters={clusters.clusters}
              tiles={captured}
              area={area}
              onDone={() => setStage("clusters")}
            />
          )}

          {stage === "clusters" && (
            <div className="absolute inset-0 z-30 flex flex-col overflow-y-auto">
              <div className="mb-2 flex items-center gap-3">
                <h2 className="text-[13px] font-semibold uppercase tracking-wide text-primary">
                  Risk clusters
                </h2>
                {clusters.preview && (
                  <NeutralBadge>signature preview — engine clustering pending</NeutralBadge>
                )}
                {!clusters.preview && (
                  <span className="font-mono text-[11px] text-ink-secondary">
                    open a cluster to review its assessment ↓
                  </span>
                )}
                <span className="ml-auto font-mono text-[11px] text-ink-secondary">
                  shift+R replays the condensation
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {clusters.clusters.map((cluster) => {
                  const clickable = !clusters.preview;
                  return (
                    <motion.button
                      type="button"
                      key={cluster.id}
                      layoutId={`cluster-${cluster.id}`}
                      transition={{ duration: 0.45, ease: [0.22, 0.9, 0.24, 1] }}
                      onClick={clickable ? () => openCluster(cluster.id) : undefined}
                      disabled={!clickable}
                      className={cx(
                        "block h-[150px] rounded-(--radius-card) text-left",
                        clickable
                          ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                          : "cursor-default",
                      )}
                    >
                      <ClusterCardFace cluster={cluster} count={cluster.propertyCount} />
                    </motion.button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </LayoutGroup>
    </div>
  );
}

function WallSkeleton() {
  return (
    <div className="flex h-[calc(100vh-8.5rem)] min-h-[480px] flex-col gap-2">
      <div className="h-[74px] animate-pulse rounded-(--radius-card) border border-line bg-surface" />
      <div className="h-[41px] animate-pulse border-b border-line" />
      <div className="grid flex-1 auto-rows-[52px] grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1.5 overflow-hidden">
        {Array.from({ length: 120 }, (_, index) => (
          <div
            key={index}
            className="animate-pulse rounded-[4px] border border-line bg-surface"
            style={{ animationDelay: `${(index % 24) * 60}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
