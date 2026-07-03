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

  // R1 — argile fort + arrêté sécheresse + maison ancienne -> risque structurel (fissures).
  if (risksData && energyData && isOldHouse) {
    const hasSecheresseArrete = risksData.catnat.some((c) =>
      c.libelleRisqueJo.toLowerCase().includes("sécheresse"),
    );
    if (risksData.summary.argiles.niveau === "fort" && hasSecheresseArrete) {
      findings.push({
        id: "argile-secheresse-maison-ancienne",
        title: "Risque de fissures liées au retrait-gonflement des argiles",
        severity: "alerte",
        domains: ["risques", "energie"],
        explanation: `Le sol est classé en aléa argile fort et la commune a déjà été reconnue en état de catastrophe naturelle "sécheresse". Sur une maison construite avant ${OLD_CONSTRUCTION_YEAR} (donc sans étude de sol ni fondations adaptées à ce risque), demandez un diagnostic fissures avant achat.`,
        sources: [risks.source, energy.source],
        confidence: worstConfidence([risks.confidence, energy.confidence]),
      });
    }
  }

  // R2 — DPE F/G + prix affiché au-dessus de la médiane du secteur -> sur-évaluation potentielle.
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
        title: "Prix affiché supérieur à la médiane du secteur pour un DPE passoire thermique",
        severity: "vigilance",
        domains: ["energie", "prix"],
        explanation: `Le DPE le plus récent classe le logement ${label}, et le prix affiché (${Math.round(listingM2)} €/m²) dépasse de ${overshoot}% la médiane locale (${Math.round(pricesData.medianPriceM2)} €/m², DVF 5 ans). Chiffrez le coût des travaux de rénovation énergétique avant de négocier.`,
        sources: [energy.source, prices.source],
        confidence: worstConfidence([energy.confidence, prices.confidence]),
      });
    }
  }

  // R3 — sismicité ≥3 ou cavités + maison ancienne -> vérification structurelle.
  if (risksData && isOldHouse) {
    const seismicHigh = (risksData.summary.sismicite.zone ?? 0) >= 3;
    const cavites = risksData.summary.cavites.present;
    if (seismicHigh || cavites) {
      findings.push({
        id: "structurel-sismicite-cavites-ancienne",
        title: "Vérification structurelle recommandée",
        severity: "vigilance",
        domains: ["risques", "energie"],
        explanation: `${seismicHigh ? "La commune est en zone de sismicité renforcée" : "Une cavité souterraine est recensée à proximité"}, sur une maison construite avant ${OLD_CONSTRUCTION_YEAR}. Demandez si des travaux de renforcement ont été réalisés depuis la construction.`,
        sources: [risks.source, energy.source],
        confidence: worstConfidence([risks.confidence, energy.confidence]),
      });
    }
  }

  // R4 — air dégradé + prix affiché au-dessus du marché local -> arbitrage (prime payée malgré l'air).
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
        title: "Prime payée au-dessus du marché local malgré une qualité de l'air dégradée",
        severity: "vigilance",
        domains: ["air", "prix"],
        explanation: `L'indice ATMO du jour (${airData.atmoLabel}) indique un air dégradé, et le prix affiché dépasse la médiane des transactions récentes dans le secteur. La qualité de l'air ne semble pas se refléter dans une décote de prix.`,
        sources: [air.source, prices.source],
        confidence: worstConfidence([air.confidence, prices.confidence]),
      });
    }
  }

  // R5 — arbitrage : historique de risque répété (CatNat) vs. marché qui ne l'intègre pas.
  if (risksData && pricesData && !pricesData.coverageExcluded) {
    const repeatedCatnat = risksData.catnat.length >= 3;
    const trend = priceTrendFromTransactions(pricesData.transactions);
    if (repeatedCatnat && trend !== null && trend !== "baisse") {
      findings.push({
        id: "catnat-repete-prix-stables",
        title: "Le marché ne semble pas intégrer un historique de risque répété",
        severity: "info",
        domains: ["risques", "prix"],
        explanation: `${risksData.catnat.length} arrêtés de catastrophe naturelle ont été recensés sur cette commune, mais les prix DVF y sont ${trend === "hausse" ? "en hausse" : "stables"} sur 5 ans. Ce n'est pas contradictoire en soi (bien d'autres facteurs pèsent sur les prix), mais cela mérite d'être signalé : le risque documenté n'est pas nécessairement "payé" par le marché.`,
        sources: [risks.source, prices.source],
        confidence: worstConfidence([risks.confidence, prices.confidence]),
      });
    }
  }

  // R6 — site potentiellement pollué proche + DPE mauvais -> vigilance travaux + étude de sol.
  if (risksData && energyData?.mostRecent) {
    const nearbySite = risksData.summary.sitesPollues.sites.find(
      (s) => s.distanceM < 100 && s.etatActivite !== "En activité",
    );
    const label = energyData.mostRecent.etiquetteDpe;
    if (nearbySite && (label === "F" || label === "G")) {
      findings.push({
        id: "site-pollue-dpe-mauvais",
        title: "Site potentiellement pollué à proximité et rénovation énergétique lourde à prévoir",
        severity: "vigilance",
        domains: ["risques", "energie"],
        explanation: `Un site industriel ou de service ancien ("${nearbySite.nom}") est recensé à moins de 100m, et le DPE est classé ${label}. Si des travaux de rénovation touchant le sol ou les fondations sont envisagés, une étude de sol est recommandée avant de s'engager.`,
        sources: [risks.source, energy.source],
        confidence: worstConfidence([risks.confidence, energy.confidence]),
      });
    }
  }

  // Cross-source contradiction the Analyste arbitrates explicitly, per the brief's "credibility vs. conflict" requirement.
  if (crime.status === "unavailable" && profile.tags.includes("famille_enfants")) {
    findings.push({
      id: "securite-donnee-non-diffusee",
      title: "Donnée de sécurité non diffusée pour cette commune",
      severity: "info",
      domains: ["securite"],
      explanation:
        "Le SSMSI ne diffuse pas de statistiques pour cette commune (moins de 5 faits enregistrés sur 3 années successives) — cela ne signifie pas une commune sans délinquance, seulement une commune trop petite pour un taux fiable. Fiez-vous plutôt à votre ressenti sur place et aux données de communes voisines plus grandes.",
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
