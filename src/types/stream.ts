import { z } from "zod";
import { domainKeySchema } from "./profile";
import { domainSectionSchema, crossRuleFindingSchema, reportSchema } from "./report";

/**
 * NDJSON events emitted by the report workflow, one per line, over the SSE
 * route handler — this is what makes the report screen render progressively
 * instead of waiting ~30s for a single blob.
 */
export const reportStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("plan"),
    toolsPlanned: z.array(domainKeySchema),
    reasoning: z.string(),
  }),
  z.object({
    type: z.literal("tool-start"),
    tool: domainKeySchema,
  }),
  z.object({
    type: z.literal("section-ready"),
    section: domainSectionSchema,
  }),
  z.object({
    type: z.literal("cascade"),
    reasoning: z.string(),
    extraTools: z.array(domainKeySchema),
  }),
  z.object({
    type: z.literal("redflag"),
    finding: crossRuleFindingSchema,
  }),
  z.object({
    type: z.literal("report-complete"),
    report: reportSchema,
  }),
  z.object({
    type: z.literal("error"),
    tool: domainKeySchema.optional(),
    message: z.string(),
  }),
]);
export type ReportStreamEvent = z.infer<typeof reportStreamEventSchema>;
