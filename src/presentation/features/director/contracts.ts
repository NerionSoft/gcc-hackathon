import { z } from "zod";

/**
 * Client-side contracts for the F7 director console. These parse the
 * responses of the EXISTING engine routes (scan, simulator) plus the thin
 * reset route — the console adds no new engine logic, it only drives them.
 */

export const campaignStatusSchema = z.object({
  runId: z.string(),
  status: z.string(),
  suspendedSteps: z.array(z.string()),
  suspendPayloads: z.record(z.string(), z.unknown()),
  counts: z.object({
    byStatus: z.record(z.string(), z.number()),
    byLocalAuthority: z.record(z.string(), z.number()),
    capitalUnderReviewGbp: z.number(),
  }),
});
export type CampaignStatusDTO = z.infer<typeof campaignStatusSchema>;

export const scanStartResponseSchema = z.object({
  runId: z.string(),
  status: z.string(),
});
export type ScanStartResponse = z.infer<typeof scanStartResponseSchema>;

export const simulatorStateSchema = z.object({
  status: z.enum(["idle", "running", "paused", "done"]),
  cursor: z.number().int().nonnegative(),
  totalUpdates: z.number().int().nonnegative(),
  intervalMs: z.number().int().positive(),
  lastUpdate: z.object({ id: z.string(), headline: z.string(), propertyId: z.string() }).nullable(),
  lastError: z.string().nullable(),
});
export type SimulatorStateDTO = z.infer<typeof simulatorStateSchema>;

export const resetResponseSchema = z.object({
  ok: z.boolean(),
  properties: z.number().int().nonnegative(),
  signals: z.number().int().nonnegative(),
});
export type ResetResponse = z.infer<typeof resetResponseSchema>;
