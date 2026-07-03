import {
  computeDomainWeights,
  domainKeySchema,
  DOMAIN_LABELS,
  type DomainKey,
  type UserProfile,
} from "@/types";

export interface PlanResult {
  toolsPlanned: DomainKey[];
  weights: Record<DomainKey, number>;
  reasoning: string;
}

/**
 * Deterministic by design, not an LLM call: source selection and weighting
 * must be reproducible and must work with zero LLM key configured (the
 * report's factual backbone never depends on model availability — only the
 * Analyste's narrative nuance does). All 5 domains are always collected;
 * what the Planner actually decides is priority (surfaced to the user as
 * `reasoning`) and the weights that drive the global score.
 */
export function planCollection(profile: UserProfile): PlanResult {
  const weights = computeDomainWeights(profile);
  const toolsPlanned = domainKeySchema.options.slice();
  const byWeight = toolsPlanned.slice().sort((a, b) => weights[b] - weights[a]);
  const top = byWeight.slice(0, 2);

  const propertyNote =
    profile.propertyType === "maison"
      ? " (maison — les risques structurels comptent double)"
      : profile.propertyType === "appartement"
        ? " (appartement — air et sécurité au premier plan)"
        : "";

  const reasoning =
    profile.tags.length > 0
      ? `Priorité à ${DOMAIN_LABELS[top[0]]} et ${DOMAIN_LABELS[top[1]]} d'après le profil sélectionné${propertyNote}.`
      : `Analyse équilibrée des 5 domaines${propertyNote} — sélectionnez un profil pour affiner la pondération.`;

  return { toolsPlanned, weights, reasoning };
}
