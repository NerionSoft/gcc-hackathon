import { NextResponse } from "next/server";
import { apiHandler } from "@/infrastructure/http/api-handler";
import { getClusterCards } from "@/app/api/_lib/read-models";

/**
 * Read-only: risk clusters. Serves persisted clusters once the engine's
 * `clusterByRiskPattern` has run; until then a deterministic signature-based
 * preview (`preview: true`) derived from stored signals.
 */
export const GET = apiHandler(async () => {
  return NextResponse.json(getClusterCards());
});
