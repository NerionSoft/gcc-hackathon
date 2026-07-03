import { ClusterSheet } from "@/presentation/features/cluster-sheet/cluster-sheet";

export const dynamic = "force-dynamic";

/** F3 — cluster sheet & review gate for one cluster. */
export default async function ClusterSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClusterSheet clusterId={decodeURIComponent(id)} />;
}
