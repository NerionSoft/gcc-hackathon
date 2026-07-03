import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { escalationReasonSchema, severitySchema } from "@/db/schema";
import { reasoningModel } from "@/mastra/llm";
import { VERDICT_ADJUDICATOR_INSTRUCTIONS } from "@/mastra/prompts/verdict-adjudicator";

/**
 * verdict-adjudicator (spec §4.1.C): proposes the composite verdict for one
 * property. The evidence-integrity and fairness rules are HARD-CODED in
 * src/mastra/engine/adjudication.ts and override this agent's output —
 * the LLM writes rationale, it does not hold the gavel.
 */

export const llmVerdictSchema = z.object({
  compositeVerdict: severitySchema,
  verdictRationale: z.string().min(1),
  escalationReason: escalationReasonSchema.nullable(),
});
export type LlmVerdict = z.infer<typeof llmVerdictSchema>;

export const verdictAdjudicator = new Agent({
  id: "verdict-adjudicator",
  name: "verdict-adjudicator",
  instructions: VERDICT_ADJUDICATOR_INSTRUCTIONS,
  model: () => reasoningModel(),
});
