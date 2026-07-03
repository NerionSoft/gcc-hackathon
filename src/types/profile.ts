import { z } from "zod";

/** Tappable lifestyle tags — multi-select, no long forms. */
export const lifeProfileTagSchema = z.enum([
  "famille_enfants",
  "teletravail",
  "sensibilite_air",
  "investissement_locatif",
  "senior_mobilite",
]);
export type LifeProfileTag = z.infer<typeof lifeProfileTagSchema>;

/** Property type — the other axis the Planner uses to prioritise sources. */
export const propertyTypeSchema = z.enum(["maison", "appartement", "inconnu"]);
export type PropertyType = z.infer<typeof propertyTypeSchema>;

export const userProfileSchema = z.object({
  tags: z.array(lifeProfileTagSchema).default([]),
  propertyType: propertyTypeSchema.default("inconnu"),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

export const LIFE_PROFILE_LABELS: Record<LifeProfileTag, { label: string; description: string }> = {
  famille_enfants: {
    label: "Famille avec enfants",
    description: "Priorité air, sécurité, écoles à proximité",
  },
  teletravail: {
    label: "Télétravail",
    description: "Priorité bruit et connectivité",
  },
  sensibilite_air: {
    label: "Sensibilité santé / air",
    description: "Priorité forte sur la qualité de l'air",
  },
  investissement_locatif: {
    label: "Investissement locatif",
    description: "Priorité marché, prix et rendement",
  },
  senior_mobilite: {
    label: "Personne âgée / mobilité",
    description: "Priorité services de proximité, accessibilité",
  },
};

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  maison: "Maison",
  appartement: "Appartement",
  inconnu: "Peu importe",
};

/** Domains the report scores and weights independently. */
export const domainKeySchema = z.enum(["risques", "prix", "air", "securite", "energie"]);
export type DomainKey = z.infer<typeof domainKeySchema>;

export const DOMAIN_LABELS: Record<DomainKey, string> = {
  risques: "les risques naturels",
  prix: "le marché immobilier",
  air: "la qualité de l'air",
  securite: "la sécurité",
  energie: "l'énergie",
};

export const DOMAIN_TITLES: Record<DomainKey, string> = {
  risques: "Risques naturels & technologiques",
  prix: "Prix & marché",
  air: "Qualité de l'air",
  securite: "Sécurité",
  energie: "Énergie",
};

const baseWeights: Record<DomainKey, number> = {
  risques: 1,
  prix: 1,
  air: 1,
  securite: 1,
  energie: 1,
};

/** Multiplicative weight adjustments per selected tag — combined then re-normalised by the Planner. */
const TAG_WEIGHT_ADJUSTMENTS: Record<LifeProfileTag, Partial<Record<DomainKey, number>>> = {
  famille_enfants: { air: 1.6, securite: 1.4, risques: 1.2 },
  teletravail: { air: 1.1, prix: 0.9 },
  sensibilite_air: { air: 2, securite: 0.8 },
  investissement_locatif: { prix: 1.8, energie: 1.3, securite: 0.9 },
  senior_mobilite: { securite: 1.3, energie: 1.2, risques: 1.1 },
};

/**
 * Combine per-tag adjustments then re-normalise so weights always sum to
 * domainKeySchema.options.length (i.e. average weight stays 1) — this keeps
 * the global score on the same 0-100 scale regardless of how many tags are picked.
 */
export function computeDomainWeights(profile: UserProfile): Record<DomainKey, number> {
  const weights = { ...baseWeights };
  for (const tag of profile.tags) {
    const adjustments = TAG_WEIGHT_ADJUSTMENTS[tag];
    for (const [domain, factor] of Object.entries(adjustments) as [DomainKey, number][]) {
      weights[domain] *= factor;
    }
  }
  const domains = domainKeySchema.options;
  const sum = domains.reduce((acc, d) => acc + weights[d], 0);
  const scale = domains.length / sum;
  for (const d of domains) weights[d] *= scale;
  return weights;
}
