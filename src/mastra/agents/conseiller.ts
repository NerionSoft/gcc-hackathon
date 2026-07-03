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
    summary: "Donnée indisponible pour cette adresse.",
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
      risks.error ?? risks.warnings[0] ?? "Géorisques indisponible.",
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

  const detail = [
    d.summary.inondation.expose
      ? "Zone exposée au risque d'inondation."
      : "Pas d'exposition notable au risque d'inondation identifiée par Géorisques.",
    `Aléa retrait-gonflement des argiles : ${d.summary.argiles.niveau}.`,
    d.summary.sismicite.zone
      ? `Zone de sismicité réglementaire : ${d.summary.sismicite.zone}/5.`
      : "Zone de sismicité non déterminée.",
    d.summary.radon.classe
      ? `Potentiel radon : classe ${d.summary.radon.classe}/3.`
      : "Potentiel radon non diffusé pour cette commune.",
    d.summary.cavites.present
      ? `${d.summary.cavites.nombre ?? "Une ou plusieurs"} cavité(s) souterraine(s) recensée(s) à proximité.`
      : "Aucune cavité souterraine recensée à proximité.",
    d.summary.sitesPollues.nombre > 0
      ? `${d.summary.sitesPollues.nombre} site(s) potentiellement pollué(s) recensé(s) dans un rayon de 200m.`
      : "Aucun site potentiellement pollué recensé à moins de 200m.",
    `${d.catnat.length} arrêté(s) de catastrophe naturelle recensé(s) sur la commune depuis 1982.`,
    d.aziZones && d.aziZones.length > 0
      ? `Zone(s) inondable(s) documentée(s) (AZI) : ${d.aziZones.map((z) => z.libelle).join(", ")}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const summary =
    severe >= 2
      ? "Plusieurs aléas significatifs cumulés sur cette adresse."
      : severe === 1 || moderate >= 1
        ? "Un aléa mérite votre attention."
        : "Aucun aléa majeur détecté par Géorisques.";

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
      prices.error ?? "DVF indisponible pour cette zone.",
    );
  const d = prices.data;
  if (d.coverageExcluded) {
    return {
      domain: "prix",
      title: DOMAIN_TITLES.prix,
      verdict: "indisponible",
      summary: "DVF ne couvre pas ce territoire.",
      detail:
        "Mayotte et les départements d'Alsace-Moselle (droit local) ne sont pas couverts par les Demandes de Valeurs Foncières.",
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
      ? `Médiane du secteur : ${Math.round(d.medianPriceM2).toLocaleString("fr-FR")} €/m² (${d.sampleSize} transaction(s), 5 ans).`
      : "Trop peu de transactions comparables pour établir une médiane fiable.";

  const detail = [
    `${d.transactions.length} transaction(s) référencée(s) à proximité (Cerema / DVF, 5 dernières années).`,
    listingM2 !== null && d.medianPriceM2 !== null
      ? `Le prix affiché (${Math.round(listingM2).toLocaleString("fr-FR")} €/m²) représente ${Math.round((listingM2 / d.medianPriceM2) * 100)}% de la médiane locale.`
      : "Renseignez un prix affiché et une surface pour comparer ce bien à la médiane locale.",
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
      air.error ?? "Indice ATMO non disponible pour cette commune.",
    );
  }
  const idx = air.data.atmoIndex;
  const verdict: Verdict = idx <= 2 ? "favorable" : idx === 3 ? "vigilance" : "alerte";
  const summary = `Indice ATMO du jour : ${air.data.atmoLabel} (${idx}/6).`;
  const detail = `Mesure du ${air.data.date}${air.data.nearestStation ? ` pour la zone "${air.data.nearestStation}"` : ""}. L'indice ATMO synthétise les concentrations de particules fines (PM10, PM2.5), NO2, O3 et SO2 en un score journalier unique (échelle nationale officielle).`;
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

export function buildSecuriteSection(crime: ToolResult<CrimeData>, weight: number): DomainSection {
  if (!crime.data)
    return indisponibleSection(
      "securite",
      crime.source,
      weight,
      crime.error ?? "Aucune statistique SSMSI disponible.",
    );
  const diffused = crime.data.indicateurs.filter((i) => !i.supprime);
  if (diffused.length === 0) {
    return {
      domain: "securite",
      title: DOMAIN_TITLES.securite,
      verdict: "indisponible",
      summary: "Statistiques non diffusées pour cette commune.",
      detail:
        "Le SSMSI ne diffuse pas de données pour les communes ayant enregistré moins de 5 faits sur 3 années successives, pour éviter des taux peu fiables ou individualisants. Ce n'est pas une absence de délinquance, seulement une absence de donnée exploitable.",
      sources: [crime.source],
      confidence: "low",
      weight,
    };
  }
  const hausseCount = diffused.filter((i) => i.tendance === "hausse").length;
  const verdict: Verdict = hausseCount / diffused.length > 0.5 ? "vigilance" : "favorable";
  const summary = `${diffused.length} indicateur(s) diffusé(s) pour ${crime.data.annee}, dont ${hausseCount} en hausse.`;
  const detail = [
    "Données communales annuelles (taux pour 1000 habitants) — pas une carte du crime rue par rue.",
    ...diffused.map(
      (i) =>
        `${i.indicateur} : ${i.tauxPour1000?.toFixed(2)} ‰${i.tendance ? ` (${i.tendance})` : ""}.`,
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
      energy.error ?? "Aucun diagnostic DPE trouvé à proximité.",
    );
  }
  const r = energy.data.mostRecent;
  const verdict: Verdict = (["A", "B", "C"] as string[]).includes(r.etiquetteDpe)
    ? "favorable"
    : (["D", "E"] as string[]).includes(r.etiquetteDpe)
      ? "vigilance"
      : "alerte";
  const summary = `DPE ${r.etiquetteDpe} (GES ${r.etiquetteGes}).`;
  const detail = [
    `Étiquette énergie ${r.etiquetteDpe}, étiquette climat (GES) ${r.etiquetteGes}.`,
    r.anneeConstruction
      ? `Logement construit en ${r.anneeConstruction}.`
      : "Année de construction non renseignée.",
    r.surfaceHabitable ? `Surface habitable diagnostiquée : ${r.surfaceHabitable} m².` : "",
    `Diagnostic établi le ${r.dateDpe}.`,
    energy.data.records.length > 1
      ? `${energy.data.records.length} diagnostics recensés pour ce bâtiment (immeuble collectif) — le plus récent est présenté.`
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
    `Moyenne pondérée des ${available.length} domaine(s) disponible(s) selon votre profil`,
    missing > 0 ? `, ${missing} domaine(s) indisponible(s) exclu(s) du calcul` : "",
    redFlags.length > 0
      ? `, ajustée de ${redFlags.length} point(s) de vigilance croisés détectés par l'Analyste`
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
    title: "Commander l'état des risques et pollutions (ERP) officiel",
    category: "demarche_officielle",
    reason: "Document légalement obligatoire avant la signature du compromis de vente.",
  });

  if (
    risksData?.summary.argiles.niveau === "fort" ||
    risksData?.catnat.some((c) => c.libelleRisqueJo.toLowerCase().includes("sécheresse"))
  ) {
    actions.push({
      title:
        "Demander si des fissures ont été constatées et si un diagnostic structure a été réalisé",
      category: "question_vendeur",
      reason: "Aléa argile fort et/ou historique CatNat sécheresse détecté sur la commune.",
    });
  }
  if (risksData && risksData.summary.sitesPollues.nombre > 0) {
    actions.push({
      title: "Demander une étude de sol avant tous travaux touchant les fondations",
      category: "verification",
      reason: "Site potentiellement pollué recensé à moins de 200m.",
    });
    actions.push({
      title: "Consulter le PLU en mairie pour vérifier d'éventuelles servitudes environnementales",
      category: "demarche_officielle",
      reason: "Site potentiellement pollué recensé à proximité.",
    });
  }
  if (risksData?.summary.radon.classe === 3) {
    actions.push({
      title: "Se renseigner sur la ventilation/aération existante (potentiel radon élevé)",
      category: "verification",
      reason: "Commune classée en potentiel radon 3/3.",
    });
  }
  if (
    energyData?.mostRecent &&
    (["F", "G"] as string[]).includes(energyData.mostRecent.etiquetteDpe)
  ) {
    actions.push({
      title: "Demander le détail des factures énergétiques des deux dernières années",
      category: "question_vendeur",
      reason: `DPE ${energyData.mostRecent.etiquetteDpe} — passoire thermique.`,
    });
    actions.push({
      title:
        "Faire chiffrer les travaux de rénovation énergétique par un professionnel avant de signer",
      category: "verification",
      reason: `DPE ${energyData.mostRecent.etiquetteDpe}.`,
    });
  }
  if (
    input.prices.data &&
    !input.prices.data.coverageExcluded &&
    input.prices.data.sampleSize >= 3
  ) {
    actions.push({
      title:
        "Demander au notaire une copie des actes de vente comparables récents dans le quartier",
      category: "question_notaire",
      reason: "Vérifier la cohérence du prix affiché avec les transactions locales récentes.",
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
