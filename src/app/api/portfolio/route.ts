import { NextResponse } from "next/server";
import { apiHandler } from "@/infrastructure/http/api-handler";
import { listPortfolio, portfolioCounts, portfolioFilterSchema } from "@/mastra/engine/portfolio";

/** F1 portfolio wall: filterable lite tiles + live counters. */
export const GET = apiHandler(async (req) => {
  const url = new URL(req.url);
  const filter = portfolioFilterSchema.parse(Object.fromEntries(url.searchParams));
  const { tiles, total } = listPortfolio(filter);
  return NextResponse.json({ tiles, total, counts: portfolioCounts() });
});
