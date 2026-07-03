import { z } from "zod";

export const dpeLabelSchema = z.enum(["A", "B", "C", "D", "E", "F", "G"]);

export const dpeRecordSchema = z.object({
  etiquetteDpe: dpeLabelSchema,
  etiquetteGes: dpeLabelSchema,
  consommationKwhM2An: z.number().nullable(),
  anneeConstruction: z.number().nullable(),
  surfaceHabitable: z.number().nullable(),
  adresse: z.string(),
  dateDpe: z.string(),
});
export type DpeRecord = z.infer<typeof dpeRecordSchema>;

export const energyDataSchema = z.object({
  records: z.array(dpeRecordSchema),
  mostRecent: dpeRecordSchema.nullable(),
});
export type EnergyData = z.infer<typeof energyDataSchema>;
