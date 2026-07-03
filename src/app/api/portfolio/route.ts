import { NextResponse } from "next/server";
import { apiHandler } from "@/infrastructure/http/api-handler";
import { getPortfolioTiles } from "@/app/api/_lib/read-models";

/** Read-only: the full portfolio as compact wall tiles (~2,800 rows). */
export const GET = apiHandler(async () => {
  return NextResponse.json({ properties: getPortfolioTiles() });
});
