import { domainKeySchema } from "@/types";
import type {
  ActionItem,
  Address,
  CrossRuleFinding,
  DomainSection,
  MapLayers,
  Report,
  ReportStreamEvent,
  SourceRef,
} from "@/types";

/**
 * Hand-authored, fully offline demo data for exactly two illustrative
 * scenarios — used by the `/api/report/stream` and `/api/report/pdf` routes
 * whenever the request carries `?demo=urban` or `?demo=rural`. This lets a
 * presentation replay a believable, sourced report without depending on live
 * government APIs (Cerema/DVF in particular can take 5+ seconds and is
 * documented as flaky) or network availability at all.
 *
 * Every `SourceRef.retrievedAt` and `Report.generatedAt` is stamped with the
 * real current time by `buildDemoEvents`, not hardcoded, so a demo run
 * always looks freshly fetched.
 *
 * The two addresses reused here are the same ones offered as demo buttons in
 * `src/components/screens/demo-addresses.ts`, so the page header and map
 * (which read `label`/`lat`/`lon` straight from the URL query string) stay
 * visually consistent with the fixture's own baked-in `Report.address`.
 */
export type DemoScenarioId = "urban" | "rural";

const ALL_DOMAINS = domainKeySchema.options;

function source(name: string, url: string, now: Date, datasetVintage?: string): SourceRef {
  return datasetVintage
    ? { name, url, retrievedAt: now.toISOString(), datasetVintage }
    : { name, url, retrievedAt: now.toISOString() };
}

const GEORISQUES_NAME = "Géorisques (BRGM / French Ministry for Ecological Transition)";
const CEREMA_NAME = "Cerema — Land Data API (DVF open data)";
const ATMO_NAME = "Atmo Data (AASQA federation, ATMO index)";
const SSMSI_NAME = "SSMSI (Ministry of the Interior) — communal crime statistics";
const SSMSI_URL =
  "https://www.data.gouv.fr/datasets/bases-statistiques-communale-departementale-et-regionale-de-la-delinquance-enregistree-par-la-police-et-la-gendarmerie-nationales/";
const SSMSI_VINTAGE = "2025 geography, published 2026-02-03";
const ADEME_NAME = "ADEME — Energy Performance Diagnostics (DPE)";

// ---------------------------------------------------------------------------
// Scenario "urban" — 8 Rue de la Paix, Paris 2e — clean-ish city apartment.
// Mostly favorable verdicts, a single vigilance-level energy rating, and one
// low-severity "info" insight. Shows what a reassuring report looks like.
// ---------------------------------------------------------------------------

export const URBAN_ADDRESS: Address = {
  label: "8 Rue de la Paix 75002 Paris",
  lat: 48.868831,
  lon: 2.330992,
  citycode: "75102",
  postcode: "75002",
  city: "Paris",
  street: "Rue de la Paix",
  housenumber: "8",
  score: 0.96,
  type: "housenumber",
};

function buildUrbanEvents(now: Date): ReportStreamEvent[] {
  const geoUrl = `https://www.georisques.gouv.fr/api/v1/resultats_rapport_risque?latlon=${URBAN_ADDRESS.lon},${URBAN_ADDRESS.lat}`;
  const ceremaUrl =
    "https://apidf-preprod.cerema.fr/dvf_opendata/geomutations/?in_bbox=2.32187,48.862831,2.340114,48.874831&anneemut_min=2021&page_size=200";
  const atmoUrl = `https://data.atmo-france.org/geoserver/ind/ows?service=WFS&request=GetFeature&TypeNames=ind_atmo_2021&outputformat=json&CQL_FILTER=code_zone='${URBAN_ADDRESS.citycode}'`;
  const ademeUrl = `https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines?geo_distance=${URBAN_ADDRESS.lon},${URBAN_ADDRESS.lat},50&select=numero_dpe,etiquette_dpe,etiquette_ges,annee_construction,surface_habitable_logement,adresse_ban,date_etablissement_dpe&size=30&sort=-date_etablissement_dpe`;

  const risquesSource = source(GEORISQUES_NAME, geoUrl, now);
  const prixSource = source(CEREMA_NAME, ceremaUrl, now);
  const airSource = source(ATMO_NAME, atmoUrl, now);
  const securiteSource = source(SSMSI_NAME, SSMSI_URL, now, SSMSI_VINTAGE);
  const energieSource = source(ADEME_NAME, ademeUrl, now);

  const risquesSection: DomainSection = {
    domain: "risques",
    title: "Natural & technological hazards",
    verdict: "favorable",
    summary: "No major hazard detected by Géorisques.",
    detail:
      "This address is not located within a mapped Seine flood-risk zone. Clay shrink-swell hazard: low. Regulatory seismic zone: 1/5 (very low, typical of the Paris basin). Radon potential: class 1/3 (low, sedimentary bedrock). No underground cavity linked to the old Paris gypsum quarries is recorded within the immediate vicinity. No potentially contaminated site recorded within 200m. 2 natural-disaster declaration(s) recorded for the commune since 1982 (windstorm, December 1999; flooding of the Seine, June 2016).",
    sources: [risquesSource],
    confidence: "high",
    weight: 0.9,
  };

  const prixSection: DomainSection = {
    domain: "prix",
    title: "Price & market",
    verdict: "favorable",
    summary: "Local median: €13,150/m² (22 transaction(s), 5 years).",
    detail:
      "22 transaction(s) referenced nearby (Cerema / DVF, last 5 years), almost all apartments around Place Vendôme and the Opéra district. Prices have risen roughly 4% cumulatively over the period, in line with the broader central-Paris trend. No asking price was provided for comparison against the local median.",
    sources: [prixSource],
    confidence: "high",
    weight: 1.1,
  };

  const airSection: DomainSection = {
    domain: "air",
    title: "Air quality",
    verdict: "favorable",
    summary: "Today's ATMO index: Good (2/6).",
    detail: `Measured on ${now.toISOString().slice(0, 10)} for the "Paris" zone. The ATMO index summarises fine-particle (PM10, PM2.5), NO2, O3 and SO2 concentrations into a single daily score (official national scale).`,
    sources: [airSource],
    confidence: "high",
    weight: 1.0,
  };

  const securiteSection: DomainSection = {
    domain: "securite",
    title: "Safety",
    verdict: "favorable",
    summary: "8 indicator(s) published for 2025, 1 of which is rising.",
    detail:
      "Annual communal data (rate per 1000 residents) — never a street-by-street crime map. Non-violent theft against persons: 14.80 ‰ (rising, consistent with tourist-area pickpocketing). Home burglaries: 1.90 ‰ (falling). Vehicle theft: 0.40 ‰ (stable). Theft from vehicles: 2.10 ‰ (falling). Intentional destruction and vandalism: 3.60 ‰ (stable).",
    sources: [securiteSource],
    confidence: "high",
    weight: 1.0,
  };

  const energieSection: DomainSection = {
    domain: "energie",
    title: "Energy",
    verdict: "vigilance",
    summary: "Energy rating D (climate D).",
    detail:
      "Energy label D, climate (GHG) label D. Built in 1898. Diagnosed living area: 42 m². Diagnostic performed on 2025-08-20. 2 diagnostics recorded for this building (multi-unit) — the most recent is shown.",
    sources: [energieSource],
    confidence: "high",
    weight: 1.0,
  };

  const redFlag: CrossRuleFinding = {
    id: "energie-anciennete-prix-eleve-paris",
    title: "Ageing-building energy rating not reflected in price",
    severity: "info",
    domains: ["energie", "prix"],
    explanation:
      "The most recent diagnostic rates the building D, typical of pre-1900 Haussmannian construction that hasn't undergone an envelope renovation. Local transaction prices remain among the highest in Paris and show no discount for this rating — worth budgeting for a future renovation regardless of the still-attractive market price.",
    sources: [energieSource, prixSource],
    confidence: "medium",
  };

  const actions: ActionItem[] = [
    {
      title: "Order the official risk and pollution disclosure (ERP)",
      category: "demarche_officielle",
      reason: "Legally required document before signing the preliminary sale agreement.",
    },
    {
      title: "Ask the notary for a copy of recent comparable sale deeds in the neighbourhood",
      category: "question_notaire",
      reason: "Check the asking price against recent local transactions.",
    },
    {
      title: "Ask about the co-ownership's planned works and recent shared-expense statements",
      category: "question_vendeur",
      reason:
        "Apartment in a pre-1900 building — an ageing energy rating often comes with upcoming façade or roof work voted by the co-ownership.",
    },
  ];

  const mapLayers: MapLayers = {
    sitesPollues: [],
    cavites: { present: false },
    transactions: [
      { lat: 48.869512, lon: 2.331745, prixM2: 13800, dateMutation: "2021-04-12" },
      { lat: 48.86829, lon: 2.329881, prixM2: 12650, dateMutation: "2022-02-08" },
      { lat: 48.867955, lon: 2.33241, prixM2: null, dateMutation: "2022-09-30" },
      { lat: 48.86982, lon: 2.33015, prixM2: 14200, dateMutation: "2023-06-19" },
      { lat: 48.868102, lon: 2.33198, prixM2: 13100, dateMutation: "2024-03-05" },
      { lat: 48.86934, lon: 2.3295, prixM2: 13950, dateMutation: "2025-01-22" },
    ],
  };

  const report: Report = {
    address: {
      label: URBAN_ADDRESS.label,
      lat: URBAN_ADDRESS.lat,
      lon: URBAN_ADDRESS.lon,
      citycode: URBAN_ADDRESS.citycode,
    },
    generatedAt: now.toISOString(),
    globalScore: 85,
    scoreExplanation:
      "Weighted average of the 5 available domain(s) based on your profile, adjusted by 1 cross-domain flag(s) detected by the Analyst.",
    redFlags: [redFlag],
    sections: [risquesSection, prixSection, airSection, securiteSection, energieSection],
    actions,
    mapLayers,
    warnings: ["No asking price provided — price comparison limited to the local median."],
  };

  return [
    {
      type: "plan",
      toolsPlanned: ALL_DOMAINS,
      reasoning:
        "Balanced analysis across all 5 domains (apartment — air quality and safety come first) — pick a profile to fine-tune the weighting.",
    },
    { type: "tool-start", tool: "risques" },
    { type: "tool-start", tool: "prix" },
    { type: "tool-start", tool: "air" },
    { type: "tool-start", tool: "securite" },
    { type: "tool-start", tool: "energie" },
    { type: "section-ready", section: securiteSection },
    { type: "section-ready", section: energieSection },
    { type: "section-ready", section: airSection },
    { type: "section-ready", section: prixSection },
    { type: "section-ready", section: risquesSection },
    { type: "redflag", finding: redFlag },
    { type: "report-complete", report },
  ];
}

// ---------------------------------------------------------------------------
// Scenario "rural" — Venelle de l'Église, Huelgoat (29) — old countryside
// house with real, combined issues: flood exposure (triggers the flood
// cascade), high clay shrink-swell + drought history on an old house,
// underground cavities, a nearby former industrial site with a poor energy
// rating, a repeated natural-disaster history the market doesn't seem to
// price in, and genuinely unavailable air-quality data (a real, documented
// phenomenon for small rural communes outside the ATMO monitoring network,
// not a bug).
// ---------------------------------------------------------------------------

export const RURAL_ADDRESS: Address = {
  label: "Venelle de l'Eglise 29690 Huelgoat",
  lat: 48.364193,
  lon: -3.745773,
  citycode: "29081",
  postcode: "29690",
  city: "Huelgoat",
  street: "Venelle de l'Eglise",
  score: 0.55,
  type: "street",
};

function buildRuralEvents(now: Date): ReportStreamEvent[] {
  const geoUrl = `https://www.georisques.gouv.fr/api/v1/resultats_rapport_risque?latlon=${RURAL_ADDRESS.lon},${RURAL_ADDRESS.lat}`;
  const ceremaUrl =
    "https://apidf-preprod.cerema.fr/dvf_opendata/geomutations/?in_bbox=-3.754799,48.358193,-3.736747,48.370193&anneemut_min=2021&page_size=200";
  const atmoUrl = `https://data.atmo-france.org/geoserver/ind/ows?service=WFS&request=GetFeature&TypeNames=ind_atmo_2021&outputformat=json&CQL_FILTER=code_zone='${RURAL_ADDRESS.citycode}'`;
  const ademeUrl = `https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines?geo_distance=${RURAL_ADDRESS.lon},${RURAL_ADDRESS.lat},50&select=numero_dpe,etiquette_dpe,etiquette_ges,annee_construction,surface_habitable_logement,adresse_ban,date_etablissement_dpe&size=30&sort=-date_etablissement_dpe`;

  const risquesSource = source(GEORISQUES_NAME, geoUrl, now);
  const prixSource = source(CEREMA_NAME, ceremaUrl, now);
  const airSource = source(ATMO_NAME, atmoUrl, now);
  const securiteSource = source(SSMSI_NAME, SSMSI_URL, now, SSMSI_VINTAGE);
  const energieSource = source(ADEME_NAME, ademeUrl, now);

  const risquesDetailBase =
    "Area exposed to flood risk (lower valley of the Argent river, near the Huelgoat lake). Clay shrink-swell hazard: high. Regulatory seismic zone: 2/5. Radon potential: class 3/3 (high — granitic bedrock typical of central Finistère). 3 underground cavity(ies) recorded nearby (Grotte du Diable, Gouffre du Moulin, Roche Tremblante chaos). 1 potentially contaminated site recorded within a 200m radius. 4 natural-disaster declaration(s) recorded for the commune since 1987.";

  const risquesSectionInitial: DomainSection = {
    domain: "risques",
    title: "Natural & technological hazards",
    verdict: "alerte",
    summary: "Several significant hazards combine at this address.",
    detail: risquesDetailBase,
    sources: [risquesSource],
    confidence: "medium",
    weight: 1.2,
  };

  const risquesSectionEnriched: DomainSection = {
    ...risquesSectionInitial,
    detail: `${risquesDetailBase} Documented flood zone(s) (AZI): Basse vallée de l'Argent — Huelgoat bourg.`,
  };

  const prixSection: DomainSection = {
    domain: "prix",
    title: "Price & market",
    verdict: "vigilance",
    summary:
      "Local median: €1,340/m² (6 transaction(s), 5 years) — small sample, treat with caution.",
    detail:
      "6 transaction(s) referenced nearby (Cerema / DVF, last 5 years), mostly older stone houses sold with land. Prices have drifted up roughly 9% over the period, driven by post-2020 demand for rural second homes in the Monts d'Arrée. With only 6 comparable sales, the median is indicative rather than statistically robust.",
    sources: [prixSource],
    confidence: "medium",
    weight: 0.9,
  };

  const airSection: DomainSection = {
    domain: "air",
    title: "Air quality",
    verdict: "indisponible",
    summary: "ATMO index not published for this commune.",
    detail:
      "No air-quality measurement is published for Huelgoat by the ATMO monitoring network — a common gap for small rural communes outside the fixed-station grid, not a data error. The nearest published readings are for Carhaix-Plouguer and Morlaix, roughly 20km away, and are not substituted here to avoid overstating precision.",
    sources: [airSource],
    confidence: "low",
    weight: 0.9,
  };

  const securiteSection: DomainSection = {
    domain: "securite",
    title: "Safety",
    verdict: "favorable",
    summary:
      "4 indicator(s) published for 2025, 0 of which are rising; several others not published due to low volume.",
    detail:
      "Annual communal data (rate per 1000 residents) — never a street-by-street crime map. Home burglaries: 2.10 ‰ (falling). Vehicle theft: 0.70 ‰ (stable). Intentional destruction and vandalism: 3.40 ‰ (stable). Non-violent theft against persons: 1.90 ‰ (falling). 6 indicator(s) not published (fewer than 5 recorded incidents over 3 consecutive years) — typical for a commune of this size, not an indication of missing risk.",
    sources: [securiteSource],
    confidence: "high",
    weight: 1.1,
  };

  const energieSection: DomainSection = {
    domain: "energie",
    title: "Energy",
    verdict: "alerte",
    summary: "Energy rating F (climate F).",
    detail:
      "Energy label F, climate (GHG) label F. Built in 1890. Diagnosed living area: 96 m². Diagnostic performed on 2025-09-12. Solid granite-stone walls with no insulation upgrade on record — typical for un-renovated houses of this era in the Monts d'Arrée.",
    sources: [energieSource],
    confidence: "medium",
    weight: 0.9,
  };

  const findingClay: CrossRuleFinding = {
    id: "argile-secheresse-maison-ancienne-huelgoat",
    title: "Cracking risk from clay shrink-swell",
    severity: "alerte",
    domains: ["risques", "energie"],
    explanation:
      "The soil beneath this address is classified as high clay shrink-swell hazard, and the commune has recorded a drought-related subsidence disaster declaration (2022). The house was built in 1890, well before any soil study or foundation adapted to this risk was standard practice. Ask the seller whether cracks have been noticed and whether a structural diagnostic has been carried out.",
    sources: [risquesSource, energieSource],
    confidence: "medium",
  };

  const findingStructural: CrossRuleFinding = {
    id: "structurel-cavites-maison-ancienne-huelgoat",
    title: "Structural check recommended",
    severity: "vigilance",
    domains: ["risques", "energie"],
    explanation:
      "Three underground cavities (natural granite formations linked to the Huelgoat chaos) are recorded in the surrounding area, and the house predates 1980. Ask whether the cavities have been surveyed for proximity to the building and whether any reinforcement work has been carried out since construction.",
    sources: [risquesSource, energieSource],
    confidence: "medium",
  };

  const findingContaminatedSite: CrossRuleFinding = {
    id: "site-pollue-dpe-mauvais-huelgoat",
    title: "Potentially contaminated site nearby and heavy energy renovation ahead",
    severity: "vigilance",
    domains: ["risques", "energie"],
    explanation:
      "A former water-powered sawmill (decommissioned) is recorded roughly 85m from the property, and the house is rated F for energy performance. If renovation work touching the soil or foundations is planned, a soil survey is recommended before committing.",
    sources: [risquesSource, energieSource],
    confidence: "medium",
  };

  const findingMarketMismatch: CrossRuleFinding = {
    id: "catnat-repete-prix-stables-huelgoat",
    title: "The market doesn't seem to price in a repeated risk history",
    severity: "info",
    domains: ["risques", "prix"],
    explanation:
      "4 natural-disaster declarations have been recorded for this commune since 1987 (windstorms, flooding, and drought-related subsidence), yet DVF prices here have risen roughly 9% over the last 5 years, driven by rural second-home demand. This isn't necessarily contradictory, but it's worth flagging: the documented risk history isn't necessarily \"priced in\" by the market.",
    sources: [risquesSource, prixSource],
    confidence: "medium",
  };

  const redFlags = [findingClay, findingStructural, findingContaminatedSite, findingMarketMismatch];

  const actions: ActionItem[] = [
    {
      title: "Order the official risk and pollution disclosure (ERP)",
      category: "demarche_officielle",
      reason: "Legally required document before signing the preliminary sale agreement.",
    },
    {
      title:
        "Ask whether any cracks have been noticed and whether a structural diagnostic was done",
      category: "question_vendeur",
      reason:
        "High clay shrink-swell hazard and a drought-related disaster declaration recorded for the commune.",
    },
    {
      title: "Ask for a soil survey before any work touching the foundations",
      category: "verification",
      reason: "A potentially contaminated site is recorded within 200m.",
    },
    {
      title: "Check the local urban plan (PLU) at the town hall for environmental easements",
      category: "demarche_officielle",
      reason: "A potentially contaminated site is recorded nearby.",
    },
    {
      title: "Ask about existing ventilation (high radon potential)",
      category: "verification",
      reason: "Commune classified as radon potential 3/3.",
    },
    {
      title: "Ask for the last two years of energy bills",
      category: "question_vendeur",
      reason: "Energy rating F — energy-inefficient property.",
    },
    {
      title: "Get energy renovation work quoted by a professional before signing",
      category: "verification",
      reason: "Energy rating F.",
    },
    {
      title: "Ask the notary for a copy of recent comparable sale deeds in the neighbourhood",
      category: "question_notaire",
      reason: "Check the asking price against recent local transactions.",
    },
  ];

  const mapLayers: MapLayers = {
    sitesPollues: [
      { lat: 48.36333, lon: -3.74662, nom: "Former water-powered sawmill (decommissioned)" },
    ],
    cavites: { present: true },
    transactions: [
      { lat: 48.36481, lon: -3.74692, prixM2: 1210, dateMutation: "2021-03-15" },
      { lat: 48.36305, lon: -3.74415, prixM2: 1380, dateMutation: "2022-07-02" },
      { lat: 48.36548, lon: -3.74798, prixM2: 1290, dateMutation: "2023-01-20" },
      { lat: 48.36189, lon: -3.74551, prixM2: null, dateMutation: "2023-11-08" },
      { lat: 48.36402, lon: -3.743, prixM2: 1420, dateMutation: "2024-05-30" },
      { lat: 48.36599, lon: -3.74651, prixM2: 1460, dateMutation: "2025-02-14" },
    ],
  };

  const report: Report = {
    address: {
      label: RURAL_ADDRESS.label,
      lat: RURAL_ADDRESS.lat,
      lon: RURAL_ADDRESS.lon,
      citycode: RURAL_ADDRESS.citycode,
    },
    generatedAt: now.toISOString(),
    globalScore: 28,
    scoreExplanation:
      "Weighted average of the 4 available domain(s) based on your profile, 1 unavailable domain(s) excluded from the calculation, adjusted by 4 cross-domain flag(s) detected by the Analyst.",
    redFlags,
    sections: [risquesSectionEnriched, prixSection, airSection, securiteSection, energieSection],
    actions,
    mapLayers,
    warnings: [
      "Precise clay-hazard level at the address unavailable; commune-level level used as a fallback.",
      "Few comparable transactions in the selected radius — the median is statistically weak.",
      "ATMO index not published for this commune — likely outside the local monitoring network's coverage (notably rural communes).",
      "6 indicator(s) not published (fewer than 5 recorded incidents over 3 consecutive years).",
    ],
  };

  return [
    {
      type: "plan",
      toolsPlanned: ALL_DOMAINS,
      reasoning:
        "Priority given to safety and natural hazards based on the selected profile (house — structural risks count double).",
    },
    { type: "tool-start", tool: "risques" },
    { type: "tool-start", tool: "prix" },
    { type: "tool-start", tool: "air" },
    { type: "tool-start", tool: "securite" },
    { type: "tool-start", tool: "energie" },
    { type: "section-ready", section: securiteSection },
    { type: "section-ready", section: energieSection },
    { type: "section-ready", section: airSection },
    { type: "section-ready", section: prixSection },
    { type: "section-ready", section: risquesSectionInitial },
    {
      type: "cascade",
      reasoning:
        "Flood-risk exposure detected — automatically looking up the precise flood zone (Atlas des Zones Inondables) to enrich the report.",
      extraTools: [],
    },
    { type: "section-ready", section: risquesSectionEnriched },
    { type: "redflag", finding: findingClay },
    { type: "redflag", finding: findingStructural },
    { type: "redflag", finding: findingContaminatedSite },
    { type: "redflag", finding: findingMarketMismatch },
    { type: "report-complete", report },
  ];
}

const SCENARIO_ADDRESSES: Record<DemoScenarioId, Address> = {
  urban: URBAN_ADDRESS,
  rural: RURAL_ADDRESS,
};

const SCENARIO_BUILDERS: Record<DemoScenarioId, (now: Date) => ReportStreamEvent[]> = {
  urban: buildUrbanEvents,
  rural: buildRuralEvents,
};

/** The address baked into a demo scenario's fixture (also used as its `Report.address`). */
export function getDemoAddress(scenarioId: DemoScenarioId): Address {
  return SCENARIO_ADDRESSES[scenarioId];
}

/**
 * Builds the full ordered `ReportStreamEvent[]` for a demo scenario, stamping
 * every source's `retrievedAt` and the report's `generatedAt` with `now` —
 * call with `new Date()` at request time so a replayed demo always looks
 * freshly retrieved instead of carrying a stale, hardcoded timestamp.
 */
export function buildDemoEvents(scenarioId: DemoScenarioId, now: Date): ReportStreamEvent[] {
  return SCENARIO_BUILDERS[scenarioId](now);
}

/** Convenience accessor for routes (e.g. the PDF export) that only need the final `Report`, not the full event stream. */
export function buildDemoReport(scenarioId: DemoScenarioId, now: Date): Report {
  const events = buildDemoEvents(scenarioId, now);
  const complete = events.find((e) => e.type === "report-complete");
  if (!complete || complete.type !== "report-complete") {
    throw new Error(`Demo scenario "${scenarioId}" has no report-complete event.`);
  }
  return complete.report;
}
