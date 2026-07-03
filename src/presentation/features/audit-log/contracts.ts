import { z } from "zod";
import { auditEventSchema, sourceRefSchema } from "@/db/schema";

/**
 * Contracts for the F6 audit / provenance journal. Shared by the route
 * handler (`/api/audit`) and the client hook, both parsing with these schemas
 * — the pagination + facet shape stays honest on both ends.
 */

export const auditFacetsSchema = z.object({
  actions: z.array(z.string()),
  entityTypes: z.array(z.string()),
  actors: z.array(z.string()),
});
export type AuditFacetsDTO = z.infer<typeof auditFacetsSchema>;

export const auditPageResponseSchema = z.object({
  events: z.array(auditEventSchema),
  /** Total events matching the active filter (not just this page). */
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  pageCount: z.number().int().nonnegative(),
  facets: auditFacetsSchema,
});
export type AuditPageResponse = z.infer<typeof auditPageResponseSchema>;

/**
 * A source snapshot recovered from an event's payload. Every finding is
 * sourced (spec §1); when an audit event carries a sourceRef in its payload
 * snapshot, the ledger surfaces it as a clickable link back to the record.
 */
export const eventSourceRefSchema = sourceRefSchema.partial().extend({
  url: z.string().url(),
});

/**
 * Best-effort recovery of a source link from an event's payload snapshot.
 * Looks at the top level and one level down (payloads often wrap the signal /
 * evidence object), and returns the first well-formed `sourceRef` it finds.
 */
export function extractSourceRef(payload: unknown): z.infer<typeof sourceRefSchema> | null {
  if (payload === null || typeof payload !== "object") return null;
  const seen = payload as Record<string, unknown>;
  const candidates: unknown[] = [seen.sourceRef];
  for (const value of Object.values(seen)) {
    if (value && typeof value === "object") {
      candidates.push((value as Record<string, unknown>).sourceRef);
    }
  }
  for (const candidate of candidates) {
    const parsed = sourceRefSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
  }
  return null;
}
