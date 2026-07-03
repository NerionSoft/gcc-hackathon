import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/infrastructure/http/api-handler";
import { countAuditEvents, listAuditEvents, listAuditFacets } from "@/db/access/audit";
import { actorSchema } from "@/db/schema";
import { auditPageResponseSchema } from "@/presentation/features/audit-log/contracts";

const querySchema = z.object({
  entityType: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
  actor: actorSchema.optional(),
  action: z.string().min(1).optional(),
  after: z.iso.datetime({ offset: true }).optional(),
  before: z.iso.datetime({ offset: true }).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(25),
});

/**
 * F6 — the audit / provenance journal, server-side paginated so the ledger
 * stays fast against thousands of events. Returns the current page, the total
 * matching the filter, and the distinct facet values for the filter bar.
 */
export const GET = apiHandler(async (req) => {
  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams);
  const { page, pageSize, ...filter } = querySchema.parse(raw);

  const total = countAuditEvents(filter);
  const events = listAuditEvents({ ...filter, limit: pageSize, offset: (page - 1) * pageSize });
  const facets = listAuditFacets();

  const body = auditPageResponseSchema.parse({
    events,
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
    facets,
  });
  return NextResponse.json(body);
});
