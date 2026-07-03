import { execTool } from "../tools/exec-tool";
import { directToolContext } from "../tools/context";
import { risksTool, fetchAziZones } from "../tools/risks";
import { pricesTool } from "../tools/prices";
import { airTool } from "../tools/air";
import { crimeTool } from "../tools/crime";
import { energyTool } from "../tools/energy";
import { analyzeCrossRules } from "./analyst";
import { polishReport } from "./narrator";
import {
  composeReport,
  buildRisquesSection,
  buildPrixSection,
  buildAirSection,
  buildSecuriteSection,
  buildEnergieSection,
} from "./conseiller";
import type {
  Address,
  UserProfile,
  PropertyListing,
  DomainKey,
  Report,
  ReportStreamEvent,
} from "@/types";

type Emit = (event: ReportStreamEvent) => Promise<void>;

export interface DeterministicInput {
  address: Address;
  profile: UserProfile;
  listing: PropertyListing;
  weights: Record<DomainKey, number>;
  toolsPlanned: DomainKey[];
}

/**
 * The fully deterministic fallback path — the rule engine + templated composer,
 * with an optional narrator polish. Used when no LLM key is configured, or when
 * the agentic path fails, so a report is always produced. Same streaming
 * contract as the agentic path.
 */
export async function runDeterministicReport(
  input: DeterministicInput,
  emit: Emit,
): Promise<Report> {
  const { address, profile, listing, weights, toolsPlanned } = input;

  for (const domain of toolsPlanned) {
    await emit({ type: "tool-start", tool: domain });
  }

  const risksPromise = execTool(
    risksTool.execute!(
      { lat: address.lat, lon: address.lon, citycode: address.citycode },
      directToolContext,
    ),
  ).then(async (result) => {
    await emit({ type: "section-ready", section: buildRisquesSection(result, weights.risques) });
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
    await emit({ type: "section-ready", section: buildPrixSection(result, listing, weights.prix) });
    return result;
  });

  const airPromise = execTool(
    airTool.execute!({ citycode: address.citycode }, directToolContext),
  ).then(async (result) => {
    await emit({ type: "section-ready", section: buildAirSection(result, weights.air) });
    return result;
  });

  const crimePromise = execTool(
    crimeTool.execute!({ citycode: address.citycode }, directToolContext),
  ).then(async (result) => {
    await emit({ type: "section-ready", section: buildSecuriteSection(result, weights.securite) });
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
    await emit({ type: "section-ready", section: buildEnergieSection(result, weights.energie) });
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
    await emit({
      type: "cascade",
      reasoning:
        "Flood risk exposure detected — automatically looking up the precise flood zone (Atlas des Zones Inondables) to enrich the report.",
      extraTools: [],
    });
    try {
      const aziZones = await fetchAziZones(address.citycode);
      if (aziZones.length > 0) {
        finalRisks = { ...risks, data: risks.data ? { ...risks.data, aziZones } : risks.data };
        await emit({
          type: "section-ready",
          section: buildRisquesSection(finalRisks, weights.risques),
        });
      }
    } catch {
      // Cascade is best-effort enrichment — the original risks section already streamed.
    }
  }

  const redFlags = analyzeCrossRules({
    risks: finalRisks,
    prices,
    air,
    crime,
    energy,
    profile,
    listing,
  });
  for (const finding of redFlags) {
    await emit({ type: "redflag", finding });
  }

  const report = composeReport({
    address,
    profile,
    listing,
    weights,
    risks: finalRisks,
    prices,
    air,
    crime,
    energy,
    redFlags,
  });

  // Optional narrator polish (rephrases prose only, never numbers/verdicts).
  const polished = await polishReport(report);
  if (polished !== report) {
    for (const section of polished.sections) {
      await emit({ type: "section-ready", section });
    }
    for (const finding of polished.redFlags) {
      await emit({ type: "redflag", finding });
    }
  }

  await emit({ type: "report-complete", report: polished });
  return polished;
}
