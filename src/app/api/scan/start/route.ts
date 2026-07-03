import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/infrastructure/http/api-handler";
import { startCampaign } from "@/mastra/engine/campaign";

const bodySchema = z.object({
  propertyIds: z.array(z.string().min(1)).min(1).optional(),
  minClusterSize: z.number().int().positive().optional(),
});

/** Start the civic-risk-scan campaign (F1 "Start scan" / director panel). */
export const POST = apiHandler(async (req) => {
  const body = bodySchema.parse(await req.json().catch(() => ({})));
  const runId = await startCampaign(body);
  return NextResponse.json({ runId, status: "started" }, { status: 202 });
});
