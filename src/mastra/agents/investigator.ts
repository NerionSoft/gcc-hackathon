import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { risksTool } from "../tools/risks";
import { pricesTool } from "../tools/prices";
import { airTool } from "../tools/air";
import { crimeTool } from "../tools/crime";
import { energyTool } from "../tools/energy";
import { floodZoneTool } from "../tools/risks";
import { domainKeySchema, verdictSchema, severitySchema, actionCategorySchema } from "@/types";

const MODEL = "deepseek/deepseek-chat";

/**
 * The Investigator — the genuinely agentic core. It is handed the six data
 * tools (plus a flood-zone follow-up) and the buyer's address + profile, and
 * *decides for itself* which sources to query, in what order, and when to dig
 * deeper (e.g. sees flood exposure → calls the flood-zone tool; sees a
 * contaminated site → weighs it against the energy rating). It orchestrates
 * the investigation; nothing here is a fixed pipeline.
 *
 * The tool KEYS below double as the domain names surfaced in the stream, so
 * `toolName` on each tool-call/result chunk maps straight to a report domain.
 */
export const investigatorAgent = new Agent({
  id: "investigator",
  name: "Investigator",
  instructions: `You are a property investigator for a French home-buyer due-diligence tool. You are given
an address (with coordinates and an INSEE commune code) and the buyer's life profile. You have tools that
query official French public data sources.

Your job:
1. Decide which sources matter most for THIS buyer and property, and investigate them by calling the tools.
2. Always investigate all five core domains at least once: "risques" (natural/technological hazards),
   "prix" (property prices), "air" (air quality), "securite" (safety/crime), "energie" (energy rating).
3. Follow up on your own initiative when something is concerning — for example, if the risks tool reports
   flood exposure, call the flood-zone tool to name the zone; if you see a contaminated site, weigh it
   against the energy rating and the buyer's plans.
4. Pass the exact coordinates/citycode you were given to each tool. Never invent a value.

Call the tools with these argument shapes:
- risques: { lat, lon, citycode }
- prix: { lat, lon, citycode, propertyType }
- air: { citycode }
- securite: { citycode }
- energie: { lat, lon, housenumber?, street? }
- floodZone: { citycode }

When you have gathered enough evidence, stop. A separate Assessor will write the final verdict — you only
gather and briefly note what you find. Keep any prose short; the tool results are what matter.`,
  model: MODEL,
  tools: {
    risques: risksTool,
    prix: pricesTool,
    air: airTool,
    securite: crimeTool,
    energie: energyTool,
    floodZone: floodZoneTool,
  },
});

/**
 * The Assessor — reads the evidence the Investigator gathered and forms its
 * OWN judgment: a verdict + reasoned narrative per domain, cross-domain red
 * flags no single source reveals, and concrete buyer actions. This is where
 * the agent "adds its own" on top of the raw data. Numbers stay grounded: it
 * is told to only cite figures present in the evidence, and the global score
 * is computed deterministically from the verdicts it assigns.
 */
export const assessmentSchema = z.object({
  sections: z
    .array(
      z.object({
        domain: domainKeySchema,
        verdict: verdictSchema,
        summary: z.string().describe("One factual sentence, grounded in the evidence."),
        detail: z.string().describe("A short paragraph interpreting the evidence for this domain."),
      }),
    )
    .describe("One entry per investigated domain."),
  redFlags: z
    .array(
      z.object({
        title: z.string(),
        severity: severitySchema,
        domains: z.array(domainKeySchema).min(1),
        explanation: z
          .string()
          .describe("Why this cross-domain combination matters, grounded in evidence."),
      }),
    )
    .describe("Cross-domain findings that no single source reveals. May be empty."),
  actions: z
    .array(
      z.object({
        title: z.string(),
        category: actionCategorySchema,
        reason: z.string(),
      }),
    )
    .describe("Concrete steps for the buyer: questions to ask, checks to request, official steps."),
  scoreRationale: z.string().describe("One sentence explaining the overall assessment."),
});
export type Assessment = z.infer<typeof assessmentSchema>;

export const assessorAgent = new Agent({
  id: "assessor",
  name: "Assessor",
  instructions: `You are a property due-diligence assessor. You receive the evidence an investigator gathered
from official French public sources about a property, plus the buyer's profile. Produce a structured
assessment in a calm, factual, non-alarmist tone suited to a citizen advisory tool.

Rules:
- Assign each investigated domain a verdict: "favorable", "vigilance", "alerte", or "indisponible"
  (use "indisponible" only when the evidence says the data was unavailable).
- Ground every number, date, place name, rating and figure strictly in the evidence given. Never invent one.
- In redFlags, surface combinations that matter across domains (e.g. high clay hazard + a drought
  disaster history + an old house ⇒ cracking risk; a poor energy rating priced above the local median;
  a documented risk history the market doesn't seem to price in). Explain your reasoning. It is fine to
  return an empty list if nothing meaningful combines.
- Weigh the buyer's profile: a family with children cares more about air and safety; an investor about
  price and energy; a senior about proximity and accessibility.
- Actions must be specific and actionable (e.g. "Ask the seller whether cracks have appeared", not "be careful").`,
  model: MODEL,
});
