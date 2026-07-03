import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { reasoningModel } from "@/mastra/llm";
import { ASSESSMENT_COMPOSER_INSTRUCTIONS } from "@/mastra/prompts/assessment-composer";

/**
 * assessment-composer (spec §4.1.B): turns a RiskCluster's sourced signals
 * into (1) the cluster's typed risk dossier and (2) a plain-language
 * disclosure a non-expert can act on. Form varies; facts never do.
 */

export const composedAssessmentSchema = z.object({
  assessment: z.string().min(1),
  disclosure: z.string().min(1),
});
export type ComposedAssessment = z.infer<typeof composedAssessmentSchema>;

export const assessmentComposer = new Agent({
  id: "assessment-composer",
  name: "assessment-composer",
  instructions: ASSESSMENT_COMPOSER_INSTRUCTIONS,
  model: () => reasoningModel(),
});
