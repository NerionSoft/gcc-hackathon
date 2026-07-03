import { z } from "zod";

export const dvfPropertyTypeSchema = z.enum([
  "maison",
  "appartement",
  "dependance",
  "local_industriel",
  "autre",
]);

export const dvfTransactionSchema = z.object({
  dateMutation: z.string(),
  valeurFonciere: z.number(),
  surfaceReelleBati: z.number().nullable(),
  prixM2: z.number().nullable(),
  typeLocal: dvfPropertyTypeSchema,
  /** Cerema's open geomutations endpoint gives parcel geometry, not a street address. */
  lat: z.number(),
  lon: z.number(),
  distanceM: z.number().optional(),
});
export type DvfTransaction = z.infer<typeof dvfTransactionSchema>;

export const pricesDataSchema = z.object({
  transactions: z.array(dvfTransactionSchema),
  medianPriceM2: z.number().nullable(),
  sampleSize: z.number(),
  /** true when the commune's department is out of DVF's coverage (Mayotte, Alsace-Moselle). */
  coverageExcluded: z.boolean(),
});
export type PricesData = z.infer<typeof pricesDataSchema>;
