import Link from "next/link";
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
        {clusters.map((cluster) =>
          preview ? (
            <div key={cluster.id} className="h-[150px]">
              <ClusterCardFace cluster={cluster} count={cluster.propertyCount} />
            </div>
          ) : (
            <Link
              key={cluster.id}
              href={`/clusters/${encodeURIComponent(cluster.id)}`}
              className="block h-[150px] rounded-(--radius-card) focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <ClusterCardFace cluster={cluster} count={cluster.propertyCount} />
            </Link>
          ),
        )}
      </div>
      <p className="mt-4 text-[12px] text-ink-secondary">
        {preview
          ? "Run the portfolio scan to replace this signature preview with the engine's clusters, then open each one to review its assessment."
          : "Open a cluster to review its sourced assessment, plain-language disclosure and evidence, then approve or request changes."}
      </p>
    </div>
  );
}
