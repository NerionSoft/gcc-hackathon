import type { Agent } from "@mastra/core/agent";
import type { z } from "zod";
import { assertLlmConfigured } from "@/mastra/llm";
import { getLogger } from "@/infrastructure/logging/logger";

const logger = getLogger("mastra:structured");

/**
 * Strict-JSON generation wrapper (spec §8): every LLM output crosses a Zod
 * boundary, with ONE retry that feeds the parse error back to the model,
 * then a graceful typed failure the caller turns into an AuditEvent.
 *
 * Venice.ai (OpenAI-compatible) does not reliably honour native
 * response_format for every hosted model, so we ask Mastra to inject JSON
 * instructions into the prompt (`jsonPromptInjection`) and re-validate the
 * result ourselves — Zod is never loosened.
 */

export type StructuredResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "llm_output_unparseable"; detail: string };

/** Pull the first JSON object/array out of raw model text (fences, prose). */
export function extractJson(text: string): unknown {
  const trimmed = text
    .replace(/^[\s\S]*?```(?:json)?\s*/i, (m) => (text.includes("```") ? "" : m))
    .replace(/```[\s\S]*$/, "")
    .trim();
  for (const candidate of [trimmed, text]) {
    const start = candidate.search(/[[{]/);
    if (start === -1) continue;
    const slice = candidate.slice(start);
    // Walk back from the end to the last closing bracket.
    const end = Math.max(slice.lastIndexOf("}"), slice.lastIndexOf("]"));
    if (end === -1) continue;
    try {
      return JSON.parse(slice.slice(0, end + 1));
    } catch {
      continue;
    }
  }
  throw new Error("No parseable JSON found in model output");
}

async function attempt<T>(
  agent: Agent,
  prompt: string,
  schema: z.ZodType<T>,
  maxSteps: number,
  instructions?: string,
): Promise<{ value?: T; error?: string }> {
  const response = await agent.generate(prompt, {
    maxSteps,
    ...(instructions ? { instructions } : {}),
    structuredOutput: {
      schema,
      jsonPromptInjection: true,
      errorStrategy: "warn",
    },
  });

  // Preferred path: Mastra's structuring pass already produced the object.
  const fromObject = schema.safeParse(response.object);
  if (fromObject.success) return { value: fromObject.data };

  // Fallback path: strict-JSON parse of the raw text, still Zod-validated.
  try {
    const parsed = schema.safeParse(extractJson(response.text ?? ""));
    if (parsed.success) return { value: parsed.data };
    return {
      error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Generate a Zod-validated object from an agent: 1 retry feeding the parse
 * error back to the model, then a typed graceful failure (never a throw for
 * output problems; LLM-not-configured still throws `LlmUnavailableError`).
 */
export async function generateStructured<T>(
  agent: Agent,
  prompt: string,
  schema: z.ZodType<T>,
  { maxSteps = 6, instructions }: { maxSteps?: number; instructions?: string } = {},
): Promise<StructuredResult<T>> {
  assertLlmConfigured();

  const first = await attempt(agent, prompt, schema, maxSteps, instructions);
  if (first.value !== undefined) return { ok: true, value: first.value };

  logger.warn("LLM output failed validation; retrying with parse error", {
    agent: agent.name,
    error: first.error,
  });
  const retryPrompt =
    `${prompt}\n\nYour previous answer was rejected because it did not match the ` +
    `required JSON schema. Parse error: ${first.error}\n` +
    "Answer again with ONLY the corrected JSON object.";
  const second = await attempt(agent, retryPrompt, schema, maxSteps, instructions);
  if (second.value !== undefined) return { ok: true, value: second.value };

  return {
    ok: false,
    reason: "llm_output_unparseable",
    detail: `After 1 retry: ${second.error ?? "unknown parse failure"}`,
  };
}
