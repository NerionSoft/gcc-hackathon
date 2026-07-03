import { NextRequest, NextResponse } from "next/server";
import { geocodeTool } from "@/mastra/tools/geocode";
import { directToolContext } from "@/mastra/tools/context";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json({ status: "ok", data: [], confidence: "low", warnings: [] });
  }
  const result = await geocodeTool.execute!({ query, limit: 5 }, directToolContext);
  return NextResponse.json(result);
}
