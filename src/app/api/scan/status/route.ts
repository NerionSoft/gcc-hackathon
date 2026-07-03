import { NextResponse } from "next/server";
import { apiHandler } from "@/infrastructure/http/api-handler";
import { getCampaignStatus } from "@/mastra/engine/campaign";
import { portfolioCounts } from "@/mastra/engine/portfolio";

/** Poll the campaign run: which gate it waits at + live wall counters. */
export const GET = apiHandler(async (req) => {
  const runId = new URL(req.url).searchParams.get("runId") ?? undefined;
  const status = await getCampaignStatus(runId);
  return NextResponse.json({ ...status, counts: portfolioCounts() });
});
