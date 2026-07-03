import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/infrastructure/http/api-handler";
import { searchProperties } from "@/app/api/_lib/read-models";

const querySchema = z.object({ q: z.string().min(1).max(300) });

/**
 * Read-only F0 resolver: address / UPRN / title number / postcode / listing
 * URL → matching seeded properties, best first.
 */
export const GET = apiHandler(async (req) => {
  const { q } = querySchema.parse({ q: new URL(req.url).searchParams.get("q") });
  return NextResponse.json({ query: q, results: searchProperties(q) });
});
