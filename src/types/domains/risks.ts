import { z } from "zod";

export const clayShrinkSwellLevelSchema = z.enum(["faible", "moyen", "fort", "inconnu"]);
export const seismicZoneSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export const radonClassSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const catNatArreteSchema = z.object({
  libelleRisqueJo: z.string(),
  dateDebut: z.string(),
  dateFin: z.string(),
  dateArrete: z.string(),
  dateJo: z.string().nullable(),
});
export type CatNatArrete = z.infer<typeof catNatArreteSchema>;

export const siteBasiasSchema = z.object({
  nom: z.string(),
  lat: z.number(),
  lon: z.number(),
  distanceM: z.number(),
  etatActivite: z.string().optional(),
});

export const naturalRiskSummarySchema = z.object({
  inondation: z.object({
    expose: z.boolean(),
    zoneType: z.string().optional(),
  }),
  argiles: z.object({
    niveau: clayShrinkSwellLevelSchema,
  }),
  sismicite: z.object({
    zone: seismicZoneSchema.nullable(),
  }),
  radon: z.object({
    classe: radonClassSchema.nullable(),
  }),
  cavites: z.object({
    present: z.boolean(),
    nombre: z.number().optional(),
  }),
  mouvementsTerrain: z.object({
    present: z.boolean(),
  }),
  sitesPollues: z.object({
    nombre: z.number(),
    sites: z.array(siteBasiasSchema),
  }),
});
export type NaturalRiskSummary = z.infer<typeof naturalRiskSummarySchema>;

export const aziZoneSchema = z.object({
  libelle: z.string(),
  risques: z.array(z.string()),
});
export type AziZone = z.infer<typeof aziZoneSchema>;

export const risksDataSchema = z.object({
  summary: naturalRiskSummarySchema,
  catnat: z.array(catNatArreteSchema),
  reportPdfUrl: z.string().optional(),
  /** Only populated when the Planner cascades into it after detecting flood exposure. */
  aziZones: z.array(aziZoneSchema).optional(),
});
export type RisksData = z.infer<typeof risksDataSchema>;
