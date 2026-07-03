import { z } from "zod";

export const confidenceLevelSchema = z.enum(["high", "medium", "low"]);
export type ConfidenceLevel = z.infer<typeof confidenceLevelSchema>;

export const sourceRefSchema = z.object({
  name: z.string(),
  url: z.string(),
  /** ISO timestamp of the actual HTTP call, not of the dataset itself. */
  retrievedAt: z.string(),
  /** Best-known freshness of the underlying dataset (e.g. "DVF 2024 T4", "millésime 2023"), when the source states one. */
  datasetVintage: z.string().optional(),
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

export const toolStatusSchema = z.enum(["ok", "partial", "unavailable", "error"]);
export type ToolStatus = z.infer<typeof toolStatusSchema>;

/**
 * Every collector tool returns this envelope, never raw data. `data` is null
 * whenever status is "unavailable" or "error" — the report renders a typed
 * "donnée manquante" state instead of inventing a value.
 */
export function toolResultSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    status: toolStatusSchema,
    data: dataSchema.nullable(),
    confidence: confidenceLevelSchema,
    source: sourceRefSchema,
    warnings: z.array(z.string()).default([]),
    error: z.string().optional(),
  });
}
export type ToolResult<T> = {
  status: ToolStatus;
  data: T | null;
  confidence: ConfidenceLevel;
  source: SourceRef;
  warnings: string[];
  error?: string;
};

export function okResult<T>(
  data: T,
  source: SourceRef,
  confidence: ConfidenceLevel,
  warnings: string[] = [],
): ToolResult<T> {
  return { status: "ok", data, confidence, source, warnings };
}

export function partialResult<T>(data: T, source: SourceRef, warnings: string[]): ToolResult<T> {
  return { status: "partial", data, confidence: "medium", source, warnings };
}

export function unavailableResult<T>(source: SourceRef, reason: string): ToolResult<T> {
  return { status: "unavailable", data: null, confidence: "low", source, warnings: [reason] };
}

export function errorResult<T>(source: SourceRef, error: string): ToolResult<T> {
  return { status: "error", data: null, confidence: "low", source, warnings: [], error };
}
