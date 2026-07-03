import { z } from "zod";

/**
 * ATMO index, national daily air-quality index. 1 (good) to 6 (extremely
 * poor) is the normal scale; 0 means "absent" (no measurement that day)
 * and 7 flags an active pollution event — both real values the live WFS
 * feed can return, not something to reject as invalid.
 */
export const atmoIndexSchema = z.number().int().min(0).max(7);

export const pollutantReadingsSchema = z.object({
  pm25: z.number().optional(),
  pm10: z.number().optional(),
  no2: z.number().optional(),
  o3: z.number().optional(),
  so2: z.number().optional(),
});
export type PollutantReadings = z.infer<typeof pollutantReadingsSchema>;

export const airDataSchema = z.object({
  atmoIndex: atmoIndexSchema.nullable(),
  atmoLabel: z.string().nullable(),
  date: z.string(),
  /** Fine-grained pollutant measurements from Geod'air, when a key is configured — otherwise omitted, never fabricated. */
  pollutants: pollutantReadingsSchema.optional(),
  nearestStation: z.string().optional(),
});
export type AirData = z.infer<typeof airDataSchema>;
