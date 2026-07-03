import { getClusterCards } from "@/app/api/_lib/read-models";
import { ClusterCardFace } from "@/presentation/features/condensation/cluster-card";
import { NeutralBadge } from "@/presentation/ui/primitives/badge";
import { formatInt } from "@/presentation/ui/format";

export const dynamic = "force-dynamic";

/**
 * Clusters index. The detailed cluster sheet with the review gate (F3) is
 * phase 5; this route lists the current grouping so navigation never 404s.
 */
export default function ClustersPage() {
  const { preview, clusters } = getClusterCards();
  const total = clusters.reduce((sum, cluster) => sum + cluster.propertyCount, 0);

  return (
    <div className="py-2">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="text-[15px] font-semibold tracking-tight text-primary">Risk clusters</h1>
        {preview && <NeutralBadge>signature preview — engine clustering pending</NeutralBadge>}
        <span className="ml-auto font-mono text-[12px] text-ink-secondary tabular-nums">
          {formatInt(clusters.length)} clusters · {formatInt(total)} properties
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {clusters.map((cluster) => (
          <div key={cluster.id} className="h-[150px]">
            <ClusterCardFace cluster={cluster} count={cluster.propertyCount} />
          </div>
        ))}
      </div>
      <p className="mt-4 text-[12px] text-ink-secondary">
        Cluster sheets — grouped evidence, plain-language disclosure and the human review gate —
        open from these cards in the next phase.
      </p>
    </div>
  );
}
