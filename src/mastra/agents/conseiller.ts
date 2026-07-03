import { askingPriceM2 } from "@/types/listing";
import { DOMAIN_TITLES } from "@/types";
import type {
  Address,
  ToolResult,
  RisksData,
  PricesData,
  AirData,
  CrimeData,
  EnergyData,
  UserProfile,
  PropertyListing,
  DomainKey,
  DomainSection,
  Verdict,
  CrossRuleFinding,
  ActionItem,
  MapLayers,
  Report,
  SourceRef,
} from "@/types";

export interface ConseillerInput {
  address: Address;
  profile: UserProfile;
  listing: PropertyListing;
  weights: Record<DomainKey, number>;
  risks: ToolResult<RisksData>;
  prices: ToolResult<PricesData>;
  air: ToolResult<AirData>;
  crime: ToolResult<CrimeData>;
  energy: ToolResult<EnergyData>;
  redFlags: CrossRuleFinding[];
}

function indisponibleSection(
  domain: DomainKey,
  source: SourceRef,
  weight: number,
  reason: string,
): DomainSection {
  return {
    domain,
    title: DOMAIN_TITLES[domain],
    verdict: "indisponible",
    summary: "Data unavailable for this address.",
    detail: reason,
    sources: [source],
    confidence: "low",
    weight,
  };
}

export function buildRisquesSection(risks: ToolResult<RisksData>, weight: number): DomainSection {
  if (!risks.data)
    return indisponibleSection(
      "risques",
      risks.source,
      weight,
      risks.error ?? risks.warnings[0] ?? "Géorisques unavailable.",
    );
  const d = risks.data;

  const severe = [
    d.summary.inondation.expose,
    d.summary.argiles.niveau === "fort",
    (d.summary.sismicite.zone ?? 0) >= 4,
    d.summary.radon.classe === 3,
    d.summary.cavites.present,
    d.summary.sitesPollues.nombre > 0,
  ].filter(Boolean).length;
  const moderate = [
    d.summary.argiles.niveau === "moyen",
    (d.summary.sismicite.zone ?? 0) === 3,
  ].filter(Boolean).length;
  const verdict: Verdict =
    severe >= 2 ? "alerte" : severe === 1 || moderate >= 1 ? "vigilance" : "favorable";

  const levelLabel: Record<string, string> = { faible: "low", moyen: "medium", fort: "high", inconnu: "unknown" };

  const detail = [
    d.summary.inondation.expose
      ? "Area exposed to flood risk."
      : "No notable flood risk exposure identified by Géorisques.",
    `Clay shrink-swell hazard: ${levelLabel[d.summary.argiles.niveau] ?? d.summary.argiles.niveau}.`,
    d.summary.sismicite.zone
      ? `Regulatory seismic zone: ${d.summary.sismicite.zone}/5.`
      : "Seismic zone not determined.",
    d.summary.radon.classe
      ? `Radon potential: class ${d.summary.radon.classe}/3.`
      : "Radon potential not published for this commune.",
    d.summary.cavites.present
      ? `${d.summary.cavites.nombre ?? "One or more"} underground cavity(ies) recorded nearby.`
      : "No underground cavities recorded nearby.",
    d.summary.sitesPollues.nombre > 0
      ? `${d.summary.sitesPollues.nombre} potentially contaminated site(s) recorded within a 200m radius.`
      : "No potentially contaminated site recorded within 200m.",
    `${d.catnat.length} natural-disaster declaration(s) recorded for the commune since 1982.`,
    d.aziZones && d.aziZones.length > 0
      ? `Documented flood zone(s) (AZI): ${d.aziZones.map((z) => z.libelle).join(", ")}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const summary =
    severe >= 2
      ? "Several significant hazards combine at this address."
      : severe === 1 || moderate >= 1
        ? "One hazard deserves your attention."
        : "No major hazard detected by Géorisques.";

  return {
    domain: "risques",
    title: DOMAIN_TITLES.risques,
    verdict,
    summary,
    detail,
    sources: [risks.source],
    confidence: risks.confidence,
    weight,
  };
}

export function buildPrixSection(
  prices: ToolResult<PricesData>,
  listing: PropertyListing,
  weight: number,
): DomainSection {
  if (!prices.data)
    return indisponibleSection(
      "prix",
      prices.source,
      weight,
      prices.error ?? "DVF unavailable for this area.",
    );
  const d = prices.data;
  if (d.coverageExcluded) {
    return {
      domain: "prix",
      title: DOMAIN_TITLES.prix,
      verdict: "indisponible",
      summary: "DVF doesn't cover this territory.",
      detail:
        "Mayotte and the Alsace-Moselle départements (local law) are not covered by the Demandes de Valeurs Foncières (property transaction records).",
      sources: [prices.source],
      confidence: "high",
      weight,
    };
  }

  const listingM2 = askingPriceM2(listing);
  let verdict: Verdict = "favorable";
  if (listingM2 !== null && d.medianPriceM2 !== null) {
    const ratio = listingM2 / d.medianPriceM2;
    verdict = ratio <= 1.05 ? "favorable" : ratio <= 1.2 ? "vigilance" : "alerte";
  }

  const summary =
    d.medianPriceM2 !== null
      ? `Local median: €${Math.round(d.medianPriceM2).toLocaleString("en-US")}/m² (${d.sampleSize} transaction(s), 5 years).`
      : "Too few comparable transactions to establish a reliable median.";

  const detail = [
    `${d.transactions.length} transaction(s) referenced nearby (Cerema / DVF, last 5 years).`,
    listingM2 !== null && d.medianPriceM2 !== null
      ? `The asking price (€${Math.round(listingM2).toLocaleString("en-US")}/m²) is ${Math.round((listingM2 / d.medianPriceM2) * 100)}% of the local median.`
      : "Enter an asking price and surface area to compare this property against the local median.",
  ].join(" ");

  return {
    domain: "prix",
    title: DOMAIN_TITLES.prix,
    verdict,
    summary,
    detail,
    sources: [prices.source],
    confidence: prices.confidence,
    weight,
  };
}

export function buildAirSection(air: ToolResult<AirData>, weight: number): DomainSection {
  if (!air.data || air.data.atmoIndex === null) {
    return indisponibleSection(
      "air",
      air.source,
      weight,
      air.error ?? "ATMO index not available for this commune.",
    );
  }
  const idx = air.data.atmoIndex;
  const verdict: Verdict = idx <= 2 ? "favorable" : idx === 3 ? "vigilance" : "alerte";
  const summary = `Today's ATMO index: ${air.data.atmoLabel} (${idx}/6).`;
  const detail = `Measured on ${air.data.date}${air.data.nearestStation ? ` for the "${air.data.nearestStation}" zone` : ""}. The ATMO index summarises fine-particle (PM10, PM2.5), NO2, O3 and SO2 concentrations into a single daily score (official national scale).`;
  return {
    domain: "air",
    title: DOMAIN_TITLES.air,
    verdict,
    summary,
    detail,
    sources: [air.source],
    confidence: air.confidence,
    weight,
  };
}

const TREND_LABEL: Record<string, string> = { hausse: "rising", baisse: "falling", stable: "stable" };

export function buildSecuriteSection(crime: ToolResult<CrimeData>, weight: number): DomainSection {
  if (!crime.data)
    return indisponibleSection(
      "securite",
      crime.source,
      weight,
      crime.error ?? "No SSMSI statistics available.",
    );
  const diffused = crime.data.indicateurs.filter((i) => !i.supprime);
  if (diffused.length === 0) {
    return {
      domain: "securite",
      title: DOMAIN_TITLES.securite,
      verdict: "indisponible",
      summary: "Statistics not published for this commune.",
      detail:
        "SSMSI doesn't publish data for communes with fewer than 5 recorded incidents over 3 consecutive years, to avoid unreliable or individually-identifying rates. This isn't an absence of crime, only an absence of usable data.",
      sources: [crime.source],
      confidence: "low",
      weight,
    };
  }
  const hausseCount = diffused.filter((i) => i.tendance === "hausse").length;
  const verdict: Verdict = hausseCount / diffused.length > 0.5 ? "vigilance" : "favorable";
  const summary = `${diffused.length} indicator(s) published for ${crime.data.annee}, ${hausseCount} of which are rising.`;
  const detail = [
    "Annual communal data (rate per 1000 residents) — never a street-by-street crime map.",
    ...diffused.map(
      (i) =>
        `${i.indicateur}: ${i.tauxPour1000?.toFixed(2)} ‰${i.tendance ? ` (${TREND_LABEL[i.tendance] ?? i.tendance})` : ""}.`,
    ),
  ].join(" ");
  return {
    domain: "securite",
    title: DOMAIN_TITLES.securite,
    verdict,
    summary,
    detail,
    sources: [crime.source],
    confidence: crime.confidence,
    weight,
  };
}

export function buildEnergieSection(energy: ToolResult<EnergyData>, weight: number): DomainSection {
  if (!energy.data?.mostRecent) {
    return indisponibleSection(
      "energie",
      energy.source,
      weight,
      energy.error ?? "No energy performance diagnostic found nearby.",
    );
  }
  const r = energy.data.mostRecent;
  const verdict: Verdict = (["A", "B", "C"] as string[]).includes(r.etiquetteDpe)
    ? "favorable"
    : (["D", "E"] as string[]).includes(r.etiquetteDpe)
      ? "vigilance"
      : "alerte";
  const summary = `Energy rating ${r.etiquetteDpe} (climate ${r.etiquetteGes}).`;
  const detail = [
    `Energy label ${r.etiquetteDpe}, climate (GHG) label ${r.etiquetteGes}.`,
    r.anneeConstruction ? `Built in ${r.anneeConstruction}.` : "Year of construction not provided.",
    r.surfaceHabitable ? `Diagnosed living area: ${r.surfaceHabitable} m².` : "",
    `Diagnostic performed on ${r.dateDpe}.`,
    energy.data.records.length > 1
      ? `${energy.data.records.length} diagnostics recorded for this building (multi-unit) — the most recent is shown.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    domain: "energie",
    title: DOMAIN_TITLES.energie,
    verdict,
    summary,
    detail,
    sources: [energy.source],
    confidence: energy.confidence,
    weight,
  };
}

const VERDICT_SCORE: Record<Verdict, number> = {
  favorable: 92,
  vigilance: 55,
  alerte: 15,
  indisponible: 0,
};

function computeGlobalScore(
  sections: DomainSection[],
  redFlags: CrossRuleFinding[],
): { score: number; explanation: string } {
  const available = sections.filter((s) => s.verdict !== "indisponible");
  let weighted = 0;
  let weightSum = 0;
  for (const s of available) {
    weighted += VERDICT_SCORE[s.verdict] * s.weight;
    weightSum += s.weight;
  }
  let base = weightSum > 0 ? weighted / weightSum : 70;

  const alerteFlags = redFlags.filter((f) => f.severity === "alerte").length;
  const vigilanceFlags = redFlags.filter((f) => f.severity === "vigilance").length;
  base -= alerteFlags * 8 + vigilanceFlags * 4;
  const score = Math.round(Math.max(0, Math.min(100, base)));

  const missing = sections.length - available.length;
  const explanation = [
    `Weighted average of the ${available.length} available domain(s) based on your profile`,
    missing > 0 ? `, ${missing} unavailable domain(s) excluded from the calculation` : "",
    redFlags.length > 0
      ? `, adjusted by ${redFlags.length} cross-domain flag(s) detected by the Analyst`
      : "",
    ".",
  ].join("");

  return { score, explanation };
}

function buildActionItems(input: ConseillerInput): ActionItem[] {
  const actions: ActionItem[] = [];
  const risksData = input.risks.data;
  const energyData = input.energy.data;

  actions.push({
    title: "Order the official risk and pollution disclosure (ERP)",
    category: "demarche_officielle",
    reason: "Legally required document before signing the preliminary sale agreement.",
  });

  if (
    risksData?.summary.argiles.niveau === "fort" ||
    risksData?.catnat.some((c) => c.libelleRisqueJo.toLowerCase().includes("sécheresse"))
  ) {
    actions.push({
      title: "Ask whether any cracks have been noticed and whether a structural diagnostic was done",
      category: "question_vendeur",
      reason: "High clay shrink-swell hazard and/or drought disaster history detected for the commune.",
    });
  }
  if (risksData && risksData.summary.sitesPollues.nombre > 0) {
    actions.push({
      title: "Ask for a soil survey before any work touching the foundations",
      category: "verification",
      reason: "A potentially contaminated site is recorded within 200m.",
    });
    actions.push({
      title: "Check the local urban plan (PLU) at the town hall for environmental easements",
      category: "demarche_officielle",
      reason: "A potentially contaminated site is recorded nearby.",
    });
  }
  if (risksData?.summary.radon.classe === 3) {
    actions.push({
      title: "Ask about existing ventilation (high radon potential)",
      category: "verification",
      reason: "Commune classified as radon potential 3/3.",
    });
  }
  if (
    energyData?.mostRecent &&
    (["F", "G"] as string[]).includes(energyData.mostRecent.etiquetteDpe)
  ) {
    actions.push({
      title: "Ask for the last two years of energy bills",
      category: "question_vendeur",
      reason: `Energy rating ${energyData.mostRecent.etiquetteDpe} — energy-inefficient property.`,
    });
    actions.push({
      title: "Get energy renovation work quoted by a professional before signing",
      category: "verification",
      reason: `Energy rating ${energyData.mostRecent.etiquetteDpe}.`,
    });
  }
  if (
    input.prices.data &&
    !input.prices.data.coverageExcluded &&
    input.prices.data.sampleSize >= 3
  ) {
    actions.push({
      title: "Ask the notary for a copy of recent comparable sale deeds in the neighbourhood",
      category: "question_notaire",
      reason: "Check the asking price against recent local transactions.",
    });
  }

  return actions;
}

function buildMapLayers(input: ConseillerInput): MapLayers {
  return {
    sitesPollues: (input.risks.data?.summary.sitesPollues.sites ?? []).map((s) => ({
      lat: s.lat,
      lon: s.lon,
      nom: s.nom,
    })),
    cavites: { present: input.risks.data?.summary.cavites.present ?? false },
    transactions: (input.prices.data?.transactions ?? []).map((t) => ({
      lat: t.lat,
      lon: t.lon,
      prixM2: t.prixM2,
      dateMutation: t.dateMutation,
    })),
  };
}

/**
 * Deterministic composer — the guaranteed-correct fallback the report always
 * has, LLM or not. Every number and verdict traces back to a tool result;
 * nothing here is generated free-form.
 */
export function composeReport(input: ConseillerInput): Report {
  const sections: DomainSection[] = [
    buildRisquesSection(input.risks, input.weights.risques),
    buildPrixSection(input.prices, input.listing, input.weights.prix),
    buildAirSection(input.air, input.weights.air),
    buildSecuriteSection(input.crime, input.weights.securite),
    buildEnergieSection(input.energy, input.weights.energie),
  ];
  const { score, explanation } = computeGlobalScore(sections, input.redFlags);
  const actions = buildActionItems(input);
  const mapLayers = buildMapLayers(input);
  const warnings = [input.risks, input.prices, input.air, input.crime, input.energy].flatMap(
    (r) => r.warnings,
  );

  return {
    address: {
      label: input.address.label,
      lat: input.address.lat,
      lon: input.address.lon,
      citycode: input.address.citycode,
    },
    generatedAt: new Date().toISOString(),
    globalScore: score,
    scoreExplanation: explanation,
    redFlags: input.redFlags,
    sections,
    actions,
    mapLayers,
    warnings,
  };
}
