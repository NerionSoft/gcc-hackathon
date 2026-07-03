import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/infrastructure/http/api-handler";
import { lookupProperty } from "@/mastra/engine/lookup";

const bodySchema = z.object({
  /** Address / UPRN / postcode / listing text — resolved to one property. */
  query: z.string().min(3).max(500),
});

/** F0 — single-property lookup: the full sourced dossier in one call. */
export const POST = apiHandler(async (req) => {
  const { query } = bodySchema.parse(await req.json());
  const dossier = await lookupProperty(query);
  return NextResponse.json(dossier);
});
