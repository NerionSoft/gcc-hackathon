import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import {
  addressSchema,
  userProfileSchema,
  propertyListingSchema,
  domainKeySchema,
  reportSchema,
} from "@/types";
import { planCollection } from "../agents/planner";
import { runAgenticReport } from "../agents/agentic-report";
import { runDeterministicReport } from "../agents/deterministic-report";
import type { ReportStreamEvent } from "@/types";

/**
 * Two report paths behind one streaming contract:
 *
 * - **Agentic** (when DEEPSEEK_API_KEY is set): an Investigator LLM agent calls
 *   the data tools itself, decides priorities from the profile, and follows up
 *   on its own; an Assessor LLM agent then forms its own verdicts and
 *   cross-domain findings. See agents/agentic-report.ts.
 * - **Deterministic** (no key, or agentic failure): the rule engine + templated
 *   composer, with optional narrator polish. See agents/deterministic-report.ts.
 *
 * Both emit the same ReportStreamEvent sequence via `writer.custom(...)`, which
 * the /api/report/stream route forwards as NDJSON. Numbers are grounded in real
 * tool results in both paths — the agent never invents a figure or the score.
 */
async function emit(
  writer: { custom: (data: { type: string; data: unknown }) => Promise<void> },
  event: ReportStreamEvent,
) {
  await writer.custom({ type: "data-report-event", data: event });
}

const workflowInputSchema = z.object({
  address: addressSchema,
  profile: userProfileSchema,
  listing: propertyListingSchema,
});

const planOutputSchema = workflowInputSchema.extend({
  weights: z.record(domainKeySchema, z.number()),
  toolsPlanned: z.array(domainKeySchema),
});

const planStep = createStep({
  id: "plan",
  inputSchema: workflowInputSchema,
  outputSchema: planOutputSchema,
  execute: async ({ inputData, writer }) => {
    const plan = planCollection(inputData.profile);
    await emit(writer, {
      type: "plan",
      toolsPlanned: plan.toolsPlanned,
      reasoning: plan.reasoning,
    });
    return { ...inputData, weights: plan.weights, toolsPlanned: plan.toolsPlanned };
  },
});

const reportStep = createStep({
  id: "report",
  inputSchema: planOutputSchema,
  outputSchema: reportSchema,
  execute: async ({ inputData, writer }) => {
    const emitEvent = (event: ReportStreamEvent) => emit(writer, event);
    const { address, profile, listing, weights, toolsPlanned } = inputData;

    if (process.env.DEEPSEEK_API_KEY) {
      try {
        return await runAgenticReport({ address, profile, listing, weights }, emitEvent);
      } catch (err) {
        // Any failure in the agentic path (model down, rate limit, bad output)
        // falls back to the fully deterministic report — never a dead end.
        await emitEvent({
          type: "cascade",
          reasoning: `Agentic investigation unavailable (${err instanceof Error ? err.message : "error"}) — falling back to the deterministic engine.`,
          extraTools: [],
        });
      }
    }

    return runDeterministicReport({ address, profile, listing, weights, toolsPlanned }, emitEvent);
  },
});

export const reportWorkflow = createWorkflow({
  id: "report-workflow",
  inputSchema: workflowInputSchema,
  outputSchema: reportSchema,
})
  .then(planStep)
  .then(reportStep)
  .commit();
