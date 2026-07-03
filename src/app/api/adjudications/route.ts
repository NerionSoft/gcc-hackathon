import { NextResponse } from "next/server";
import { apiHandler } from "@/infrastructure/http/api-handler";
import { getAdjudicationBoard } from "@/app/api/_lib/read-models";
import { suspendedStepsSafe } from "@/mastra/engine/campaign";

/**
 * F4 — the adjudication war room board. Each card is an adjudication joined to
 * its property and cluster; `atHumanGate` tells the UI whether an escalated
 * decision will resume the suspended workflow or apply through the engine.
 */
export const GET = apiHandler(async () => {
  const gates = await suspendedStepsSafe();
  return NextResponse.json({
    adjudications: getAdjudicationBoard(),
    atHumanGate: gates.includes("await-human-adjudication"),
  });
});
