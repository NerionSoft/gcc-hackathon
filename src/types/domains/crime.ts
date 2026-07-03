import { z } from "zod";

export const crimeTrendSchema = z.enum(["hausse", "baisse", "stable"]);

export const crimeIndicatorSchema = z.object({
  indicateur: z.string(),
  /** null when SSMSI suppresses the value (fewer than 5 recorded facts over 3 consecutive years). */
  tauxPour1000: z.number().nullable(),
  tendance: crimeTrendSchema.nullable(),
  supprime: z.boolean(),
});
export type CrimeIndicator = z.infer<typeof crimeIndicatorSchema>;

export const crimeDataSchema = z.object({
  commune: z.string(),
  annee: z.number(),
  indicateurs: z.array(crimeIndicatorSchema),
});
export type CrimeData = z.infer<typeof crimeDataSchema>;
