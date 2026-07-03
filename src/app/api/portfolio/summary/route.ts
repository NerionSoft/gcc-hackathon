import { NextResponse } from "next/server";
import { apiHandler } from "@/infrastructure/http/api-handler";
import { getPortfolioSummary } from "@/app/api/_lib/read-models";

/** Read-only: portfolio aggregates for the context band and counters. */
export const GET = apiHandler(async () => {
  return NextResponse.json(getPortfolioSummary());
});
