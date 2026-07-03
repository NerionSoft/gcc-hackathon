import { z } from "zod";

/** A geocoded address, as returned by the BAN (Base Adresse Nationale). */
export const addressSchema = z.object({
  label: z.string(),
  lat: z.number(),
  lon: z.number(),
  /** INSEE commune code — the join key for every commune-level source (CatNat, SSMSI, Atmo). */
  citycode: z.string(),
  postcode: z.string(),
  city: z.string(),
  street: z.string().optional(),
  housenumber: z.string().optional(),
  /** BAN's own geocoding confidence, 0..1. */
  score: z.number().min(0).max(1),
  /** BAN "type": housenumber | street | locality | municipality — coarser types need a caveat in the UI. */
  type: z.enum(["housenumber", "street", "locality", "municipality"]),
});
export type Address = z.infer<typeof addressSchema>;

/** Coverage gaps that must be surfaced in the UI rather than silently producing an empty section. */
export const dvfExcludedDepartments = new Set([
  "976", // Mayotte — DVF does not cover it
  "67", // Bas-Rhin — droit local (Alsace-Moselle land registry)
  "68", // Haut-Rhin
  "57", // Moselle
]);

export function departmentFromCitycode(citycode: string): string {
  if (citycode.startsWith("97")) return citycode.slice(0, 3);
  return citycode.slice(0, 2);
}
