import { NextResponse } from "next/server";
import { apiHandler } from "@/infrastructure/http/api-handler";
import { listClusters } from "@/db/access/clusters";

/** F2/F3 — the cluster cards. */
export const GET = apiHandler(async () => {
  return NextResponse.json({ clusters: listClusters() });
});
