import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { severitySchema, sourceRefSchema, type DimensionCode } from "@/db/schema";
import { investigatorModel } from "@/mastra/llm";
import { makeEvidenceTool } from "@/mastra/tools/evidence";
import {
  BLOCK_SCANNER_INSTRUCTIONS,
  BUILDING_INSPECTOR_INSTRUCTIONS,
  LAND_SURVEYOR_INSTRUCTIONS,
  MARKET_ANALYST_INSTRUCTIONS,
  PEOPLE_INVESTIGATOR_INSTRUCTIONS,
  UNIT_PROFILER_INSTRUCTIONS,
} from "@/mastra/prompts/investigators";

/**
 * The 6 layer-specialist investigators (spec §4.1.A). Shared contract:
 * input = one Property + its dimension's RiskSignalDefinitions (in the
 * task prompt) + one dimension-scoped evidence tool; output = Zod-validated
 * signal candidates. The hard "no sourceRef → rejected + logged" gate lives
 * in src/db/access/signals.ts — every candidate goes through it.
 */

/** What an investigator is allowed to emit — everything else is rejected. */
export const investigatorFindingSchema = z.object({
  signalCode: z.string().min(1),
  finding: z.string().min(1),
  sourceRef: sourceRefSchema,
  severity: severitySchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
});
export type InvestigatorFinding = z.infer<typeof investigatorFindingSchema>;

export const investigatorOutputSchema = z.object({
  signals: z.array(investigatorFindingSchema),
});
export type InvestigatorOutput = z.infer<typeof investigatorOutputSchema>;

function makeInvestigator(id: string, dimension: DimensionCode, instructions: string): Agent {
  return new Agent({
    id,
    name: id,
    instructions,
    model: () => investigatorModel(),
    tools: { gatherEvidence: makeEvidenceTool(dimension) },
  });
}

export const buildingInspector = makeInvestigator(
  "building-inspector",
  "BUILDING",
  BUILDING_INSPECTOR_INSTRUCTIONS,
);
export const unitProfiler = makeInvestigator("unit-profiler", "UNIT", UNIT_PROFILER_INSTRUCTIONS);
export const blockScanner = makeInvestigator("block-scanner", "BLOCK", BLOCK_SCANNER_INSTRUCTIONS);
export const peopleInvestigator = makeInvestigator(
  "people-investigator",
  "PEOPLE",
  PEOPLE_INVESTIGATOR_INSTRUCTIONS,
);
export const landSurveyor = makeInvestigator("land-surveyor", "LAND", LAND_SURVEYOR_INSTRUCTIONS);
export const marketAnalyst = makeInvestigator(
  "market-analyst",
  "MARKET",
  MARKET_ANALYST_INSTRUCTIONS,
);

/** Dimension → its specialist. The whole team, in framework order. */
export const INVESTIGATORS: Record<DimensionCode, Agent> = {
  BUILDING: buildingInspector,
  UNIT: unitProfiler,
  BLOCK: blockScanner,
  PEOPLE: peopleInvestigator,
  LAND: landSurveyor,
  MARKET: marketAnalyst,
};
