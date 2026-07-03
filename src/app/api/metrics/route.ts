import { NextResponse } from "next/server";
import { apiHandler } from "@/infrastructure/http/api-handler";
import { computeImpactMetrics } from "@/mastra/engine/metrics";

/** F5 — the live civic-impact banner. */
export const GET = apiHandler(async () => NextResponse.json(computeImpactMetrics()));
