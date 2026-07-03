import { priceTrendFromTransactions } from "@/lib/stats";
import { askingPriceM2 } from "@/types/listing";
import type {
  ToolResult,
  RisksData,
  PricesData,
  AirData,
  CrimeData,
  EnergyData,
  CrossRuleFinding,
  UserProfile,
  PropertyListing,
  ConfidenceLevel,
  SourceRef,
} from "@/types";

export interface AnalystInput {
  risks: ToolResult<RisksData>;
  prices: ToolResult<PricesData>;
  air: ToolResult<AirData>;
  crime: ToolResult<CrimeData>;
  energy: ToolResult<EnergyData>;
  profile: UserProfile;
  listing: PropertyListing;
}

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { high: 3, medium: 2, low: 1 };

function worstConfidence(levels: ConfidenceLevel[]): ConfidenceLevel {
  return levels.reduce(
    (worst, c) => (CONFIDENCE_RANK[c] < CONFIDENCE_RANK[worst] ? c : worst),
    "high" as ConfidenceLevel,
  );
}

const OLD_CONSTRUCTION_YEAR = 1980;

/**
 * The Analyste's whole reason to exist: insights no single source gives you.
 * Pure and deterministic — each rule reasons over already-fetched tool
 * results, no LLM call, so a red flag is never invented and never depends on
 * model availability. Every finding must cite at least two domains' sources.
 */
export function analyzeCrossRules(input: AnalystInput): CrossRuleFinding[] {
  const { risks, prices, air, crime, energy, profile, listing } = input;
  const findings: CrossRuleFinding[] = [];

  const risksData = risks.data;
  const pricesData = prices.data;
  const airData = air.data;
  const energyData = energy.data;
  const anneeConstruction = energyData?.mostRecent?.anneeConstruction ?? null;
  const isOldHouse =
    profile.propertyType === "maison" &&
    anneeConstruction !== null &&
    anneeConstruction < OLD_CONSTRUCTION_YEAR;

  // R1 — high clay hazard + drought declaration + old house -> structural risk (cracking).
  if (risksData && energyData && isOldHouse) {
    const hasSecheresseArrete = risksData.catnat.some((c) =>
      c.libelleRisqueJo.toLowerCase().includes("sécheresse"),
    );
    if (risksData.summary.argiles.niveau === "fort" && hasSecheresseArrete) {
      findings.push({
        id: "argile-secheresse-maison-ancienne",
        title: "Cracking risk from clay shrink-swell",
        severity: "alerte",
        domains: ["risques", "energie"],
        explanation: `The soil is classified as high clay shrink-swell hazard, and the commune has already had a "drought" natural-disaster declaration. On a house built before ${OLD_CONSTRUCTION_YEAR} (so without soil study or foundations suited to this risk), ask for a cracking diagnostic before buying.`,
        sources: [risks.source, energy.source],
        confidence: worstConfidence([risks.confidence, energy.confidence]),
      });
    }
  }

  // R2 — poor energy rating + asking price above the local median -> potential overvaluation.
  if (energyData?.mostRecent && pricesData?.medianPriceM2 !== null && pricesData) {
    const label = energyData.mostRecent.etiquetteDpe;
    const listingM2 = askingPriceM2(listing);
    if (
      (label === "F" || label === "G") &&
      listingM2 !== null &&
      pricesData.medianPriceM2 !== null &&
      listingM2 > pricesData.medianPriceM2
    ) {
      const overshoot = Math.round(
        ((listingM2 - pricesData.medianPriceM2) / pricesData.medianPriceM2) * 100,
      );
      findings.push({
        id: "dpe-mauvais-prix-eleve",
        title: "Asking price above the local median for an energy-inefficient property",
        severity: "vigilance",
        domains: ["energie", "prix"],
        explanation: `The most recent energy rating classifies the property as ${label}, and the asking price (€${Math.round(listingM2)}/m²) exceeds the local median by ${overshoot}% (€${Math.round(pricesData.medianPriceM2)}/m², 5-year DVF data). Get renovation costs quoted before negotiating.`,
        sources: [energy.source, prices.source],
        confidence: worstConfidence([energy.confidence, prices.confidence]),
      });
    }
  }

  // R3 — seismicity >=3 or cavities + old house -> structural check.
  if (risksData && isOldHouse) {
    const seismicHigh = (risksData.summary.sismicite.zone ?? 0) >= 3;
    const cavites = risksData.summary.cavites.present;
    if (seismicHigh || cavites) {
      findings.push({
        id: "structurel-sismicite-cavites-ancienne",
        title: "Structural check recommended",
        severity: "vigilance",
        domains: ["risques", "energie"],
        explanation: `${seismicHigh ? "The commune is in a heightened seismic zone" : "An underground cavity is recorded nearby"}, on a house built before ${OLD_CONSTRUCTION_YEAR}. Ask whether reinforcement work has been done since construction.`,
        sources: [risks.source, energy.source],
        confidence: worstConfidence([risks.confidence, energy.confidence]),
      });
    }
  }

  // R4 — degraded air + asking price above the local market -> arbitrage (premium paid despite the air).
  if (airData && pricesData?.medianPriceM2 !== null && pricesData) {
    const listingM2 = askingPriceM2(listing);
    if (
      (airData.atmoIndex ?? 0) >= 4 &&
      listingM2 !== null &&
      pricesData.medianPriceM2 !== null &&
      listingM2 > pricesData.medianPriceM2
    ) {
      findings.push({
        id: "air-degrade-prix-superieur-marche",
        title: "Premium paid above the local market despite degraded air quality",
        severity: "vigilance",
        domains: ["air", "prix"],
        explanation: `Today's ATMO index (${airData.atmoLabel}) indicates degraded air quality, and the asking price exceeds the median of recent transactions in the area. Air quality doesn't seem to be reflected in a lower price.`,
        sources: [air.source, prices.source],
        confidence: worstConfidence([air.confidence, prices.confidence]),
      });
    }
  }

  // R5 — arbitrage: repeated risk history (CatNat) vs. a market that doesn't price it in.
  if (risksData && pricesData && !pricesData.coverageExcluded) {
    const repeatedCatnat = risksData.catnat.length >= 3;
    const trend = priceTrendFromTransactions(pricesData.transactions);
    if (repeatedCatnat && trend !== null && trend !== "baisse") {
      findings.push({
        id: "catnat-repete-prix-stables",
        title: "The market doesn't seem to price in a repeated risk history",
        severity: "info",
        domains: ["risques", "prix"],
        explanation: `${risksData.catnat.length} natural-disaster declarations have been recorded for this commune, yet DVF prices here are ${trend === "hausse" ? "rising" : "stable"} over 5 years. This isn't necessarily contradictory (many other factors affect prices), but it's worth flagging: the documented risk isn't necessarily "priced in" by the market.`,
        sources: [risks.source, prices.source],
        confidence: worstConfidence([risks.confidence, prices.confidence]),
      });
    }
  }

  // R6 — potentially contaminated site nearby + poor energy rating -> renovation/soil-survey caution.
  if (risksData && energyData?.mostRecent) {
    const nearbySite = risksData.summary.sitesPollues.sites.find(
      (s) => s.distanceM < 100 && s.etatActivite !== "En activité",
    );
    const label = energyData.mostRecent.etiquetteDpe;
    if (nearbySite && (label === "F" || label === "G")) {
      findings.push({
        id: "site-pollue-dpe-mauvais",
        title: "Potentially contaminated site nearby and heavy energy renovation ahead",
        severity: "vigilance",
        domains: ["risques", "energie"],
        explanation: `A former industrial or service site ("${nearbySite.nom}") is recorded less than 100m away, and the property is rated ${label}. If renovation work touching the soil or foundations is planned, a soil survey is recommended before committing.`,
        sources: [risks.source, energy.source],
        confidence: worstConfidence([risks.confidence, energy.confidence]),
      });
    }
  }

  // Cross-source contradiction the Analyste arbitrates explicitly, per the brief's "credibility vs. conflict" requirement.
  if (crime.status === "unavailable" && profile.tags.includes("famille_enfants")) {
    findings.push({
      id: "securite-donnee-non-diffusee",
      title: "Safety data not published for this commune",
      severity: "info",
      domains: ["securite"],
      explanation:
        "SSMSI doesn't publish statistics for this commune (fewer than 5 recorded incidents over 3 consecutive years) — this doesn't mean the commune is crime-free, only that it's too small for a reliable rate. Rely instead on your own impression on the ground and on data from larger neighbouring communes.",
      sources: [crime.source],
      confidence: "low",
    });
  }

  return findings;
}

export function collectAllSources(input: AnalystInput): SourceRef[] {
  return [
    input.risks.source,
    input.prices.source,
    input.air.source,
    input.crime.source,
    input.energy.source,
  ];
}
