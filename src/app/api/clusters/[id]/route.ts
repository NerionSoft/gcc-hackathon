import { NextResponse } from "next/server";
import { apiHandler } from "@/infrastructure/http/api-handler";
import { getCluster } from "@/db/access/clusters";
import { getProperty } from "@/db/access/properties";
import { listSignalsForProperty } from "@/db/access/signals";
import { DomainError } from "@/shared/errors/domain-error";

/**
 * F3 — cluster sheet: members, the evidence view (each finding beside its
 * cited source), assessment + plain-language disclosure.
 */
export const GET = apiHandler(async (_req, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) throw new DomainError("VALIDATION_ERROR", "Missing cluster id");
  const cluster = getCluster(id);
  if (!cluster) throw new DomainError("CLUSTER_NOT_FOUND", `Cluster not found: ${id}`);

  // Evidence view stays readable: full signals for the first members, the
  // rest of the membership as lite rows.
  const detailed = cluster.propertyIds.slice(0, 25).map((propertyId) => ({
    property: getProperty(propertyId) ?? null,
    signals: listSignalsForProperty(propertyId),
  }));

  return NextResponse.json({
    cluster,
    memberCount: cluster.propertyIds.length,
    members: detailed,
  });
});
