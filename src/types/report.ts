import { z } from "zod";
import { domainKeySchema } from "./profile";
import { sourceRefSchema, confidenceLevelSchema } from "./source";

export const verdictSchema = z.enum(["favorable", "vigilance", "alerte", "indisponible"]);
export type Verdict = z.infer<typeof verdictSchema>;

export const severitySchema = z.enum(["info", "vigilance", "alerte"]);
export type Severity = z.infer<typeof severitySchema>;

/** A cross-domain insight produced by the Analyste — the whole point of the exercise. */
export const crossRuleFindingSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: severitySchema,
  domains: z.array(domainKeySchema),
  explanation: z.string(),
  sources: z.array(sourceRefSchema),
  confidence: confidenceLevelSchema,
});
export type CrossRuleFinding = z.infer<typeof crossRuleFindingSchema>;

export const actionCategorySchema = z.enum([
  "question_vendeur",
  "question_notaire",
  "verification",
  "demarche_officielle",
]);
export type ActionCategory = z.infer<typeof actionCategorySchema>;

export const actionItemSchema = z.object({
  title: z.string(),
  category: actionCategorySchema,
  reason: z.string(),
});
export type ActionItem = z.infer<typeof actionItemSchema>;

export const domainSectionSchema = z.object({
  domain: domainKeySchema,
  title: z.string(),
  verdict: verdictSchema,
  summary: z.string(),
  detail: z.string(),
  sources: z.array(sourceRefSchema),
  confidence: confidenceLevelSchema,
  weight: z.number(),
});
export type DomainSection = z.infer<typeof domainSectionSchema>;

/**
 * Raw geometries for the interactive map — kept separate from domainSectionSchema
 * because the map needs point coordinates, not narrative verdicts. Populated by
 * the Conseiller from the same tool outputs that produced the sections.
 */
export const mapLayersSchema = z.object({
  sitesPollues: z.array(z.object({ lat: z.number(), lon: z.number(), nom: z.string() })),
  cavites: z.object({ present: z.boolean() }),
  transactions: z.array(
    z.object({
      lat: z.number(),
      lon: z.number(),
      prixM2: z.number().nullable(),
      dateMutation: z.string(),
    }),
  ),
});
export type MapLayers = z.infer<typeof mapLayersSchema>;

export const reportSchema = z.object({
  address: z.object({ label: z.string(), lat: z.number(), lon: z.number(), citycode: z.string() }),
  generatedAt: z.string(),
  globalScore: z.number().min(0).max(100),
  scoreExplanation: z.string(),
  redFlags: z.array(crossRuleFindingSchema),
  sections: z.array(domainSectionSchema),
  actions: z.array(actionItemSchema),
  mapLayers: mapLayersSchema,
  warnings: z.array(z.string()),
});
export type Report = z.infer<typeof reportSchema>;
