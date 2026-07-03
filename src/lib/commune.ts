/**
 * Several French open-data sources (SSMSI crime stats, Géorisques' commune-
 * indexed endpoints: CatNat, zonage sismique, radon, AZI) only publish Paris,
 * Lyon and Marseille at the whole-city level, not per arrondissement, even
 * though the BAN geocoder returns arrondissement-level INSEE codes (751xx,
 * 6938x, 132xx). Point-based endpoints (lat/lon queries) don't have this
 * problem — only ones keyed by `code_insee` do.
 */
export function resolveWholeCityCommuneCode(citycode: string): string {
  if (citycode.startsWith("751")) return "75056";
  if (citycode.startsWith("6938")) return "69123";
  if (citycode.startsWith("132")) return "13055";
  return citycode;
}
