import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/infrastructure/http/api-handler";
import { listAuditEvents } from "@/db/access/audit";
import { actorSchema } from "@/db/schema";

const querySchema = z.object({
  entityType: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
  actor: actorSchema.optional(),
  limit: z.coerce.number().int().positive().max(1000).default(200),
});

/** F6 — the audit / provenance journal. */
export const GET = apiHandler(async (req) => {
  const url = new URL(req.url);
  const filter = querySchema.parse(Object.fromEntries(url.searchParams));
  return NextResponse.json({ events: listAuditEvents(filter) });
});
