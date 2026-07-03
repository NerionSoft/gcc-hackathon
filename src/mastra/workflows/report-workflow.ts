import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import {
  addressSchema,
  userProfileSchema,
  propertyListingSchema,
  domainKeySchema,
  reportSchema,
  crossRuleFindingSchema,
} from "@/types";
import { risksTool, risksOutputSchema, fetchAziZones } from "../tools/risks";
import { pricesTool, pricesOutputSchema } from "../tools/prices";
import { airTool, airOutputSchema } from "../tools/air";
import { crimeTool, crimeOutputSchema } from "../tools/crime";
import { energyTool, energyOutputSchema } from "../tools/energy";
import { directToolContext } from "../tools/context";
import { execTool } from "../tools/exec-tool";
import { planCollection } from "../agents/planner";
import { analyzeCrossRules } from "../agents/analyst";
import {
  composeReport,
  buildRisquesSection,
  buildPrixSection,
  buildAirSection,
  buildSecuriteSection,
  buildEnergieSection,
} from "../agents/conseiller";
import type { ReportStreamEvent } from "@/types";

/**
 * Every progress event is forwarded through Mastra's own stream as a custom
 * "data-report-event" chunk (`writer.custom(...)`, confirmed to work
 * end-to-end via a standalone smoke test — no LLM involved at any step, so
 * this workflow runs fully offline/deterministically). The Next.js route
 * handler filters the workflow's stream down to just these chunks and
 * forwards `chunk.data` as one NDJSON line per event.
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

const collectStepOutputSchema = planOutputSchema.extend({
  risks: risksOutputSchema,
  prices: pricesOutputSchema,
  air: airOutputSchema,
  crime: crimeOutputSchema,
  energy: energyOutputSchema,
});

const collectStep = createStep({
  id: "collect",
  inputSchema: planOutputSchema,
  outputSchema: collectStepOutputSchema,
  execute: async ({ inputData, writer }) => {
    const { address, profile, weights, toolsPlanned } = inputData;

    for (const domain of toolsPlanned) {
      await emit(writer, { type: "tool-start", tool: domain });
    }

    const risksPromise = execTool(
      risksTool.execute!(
        { lat: address.lat, lon: address.lon, citycode: address.citycode },
        directToolContext,
      ),
    ).then(async (result) => {
      await emit(writer, {
        type: "section-ready",
        section: buildRisquesSection(result, weights.risques),
      });
      return result;
    });

    const pricesPromise = execTool(
      pricesTool.execute!(
        {
          lat: address.lat,
          lon: address.lon,
          citycode: address.citycode,
          propertyType: profile.propertyType,
        },
        directToolContext,
      ),
    ).then(async (result) => {
      await emit(writer, {
        type: "section-ready",
        section: buildPrixSection(result, inputData.listing, weights.prix),
      });
      return result;
    });

    const airPromise = execTool(
      airTool.execute!({ citycode: address.citycode }, directToolContext),
    ).then(async (result) => {
      await emit(writer, { type: "section-ready", section: buildAirSection(result, weights.air) });
      return result;
    });

    const crimePromise = execTool(
      crimeTool.execute!({ citycode: address.citycode }, directToolContext),
    ).then(async (result) => {
      await emit(writer, {
        type: "section-ready",
        section: buildSecuriteSection(result, weights.securite),
      });
      return result;
    });

    const energyPromise = execTool(
      energyTool.execute!(
        {
          lat: address.lat,
          lon: address.lon,
          housenumber: address.housenumber,
          street: address.street,
        },
        directToolContext,
      ),
    ).then(async (result) => {
      await emit(writer, {
        type: "section-ready",
        section: buildEnergieSection(result, weights.energie),
      });
      return result;
    });

    const [risks, prices, air, crime, energy] = await Promise.all([
      risksPromise,
      pricesPromise,
      airPromise,
      crimePromise,
      energyPromise,
    ]);

    let finalRisks = risks;
    if (risks.data?.summary.inondation.expose) {
      await emit(writer, {
        type: "cascade",
        reasoning:
          "Flood risk exposure detected — automatically looking up the precise flood zone (Atlas des Zones Inondables) to enrich the report.",
        extraTools: [],
      });
      try {
        const aziZones = await fetchAziZones(address.citycode);
        if (aziZones.length > 0) {
          finalRisks = { ...risks, data: risks.data ? { ...risks.data, aziZones } : risks.data };
          await emit(writer, {
            type: "section-ready",
            section: buildRisquesSection(finalRisks, weights.risques),
          });
        }
      } catch {
        // Cascade is best-effort enrichment — the original risks section already streamed.
      }
    }

    return { ...inputData, risks: finalRisks, prices, air, crime, energy };
  },
});

const analyzeStepOutputSchema = collectStepOutputSchema.extend({
  redFlags: z.array(crossRuleFindingSchema),
});

const analyzeStep = createStep({
  id: "analyze",
  inputSchema: collectStepOutputSchema,
  outputSchema: analyzeStepOutputSchema,
  execute: async ({ inputData, writer }) => {
    const redFlags = analyzeCrossRules({
      risks: inputData.risks,
      prices: inputData.prices,
      air: inputData.air,
      crime: inputData.crime,
      energy: inputData.energy,
      profile: inputData.profile,
      listing: inputData.listing,
    });
    for (const finding of redFlags) {
      await emit(writer, { type: "redflag", finding });
    }
    return { ...inputData, redFlags };
  },
});

const composeStep = createStep({
  id: "compose",
  inputSchema: analyzeStepOutputSchema,
  outputSchema: reportSchema,
  execute: async ({ inputData, writer }) => {
    const report = composeReport(inputData);
    await emit(writer, { type: "report-complete", report });
    return report;
  },
});

export const reportWorkflow = createWorkflow({
  id: "report-workflow",
  inputSchema: workflowInputSchema,
  outputSchema: reportSchema,
})
  .then(planStep)
  .then(collectStep)
  .then(analyzeStep)
  .then(composeStep)
  .commit();
