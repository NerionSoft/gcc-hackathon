import { env } from "@/infrastructure/config/env";
import { DomainError } from "@/shared/errors/domain-error";

/**
 * LLM host configuration (project decision, overrides spec default):
 * Venice.ai, OpenAI-compatible, serving DeepSeek models. Mastra's model
 * router receives an OpenAI-compatible config object pointing at
 * OPENAI_BASE_URL — never a hard-coded key.
 *
 * The engine must degrade gracefully when no key is configured: callers
 * check `isLlmConfigured()` (or catch `LlmUnavailableError`) and fall back
 * to deterministic behaviour + an audit event, never a crash.
 */

export const VENICE_DEFAULT_BASE_URL = "https://api.venice.ai/api/v1";

/** Default model for the 6 investigators — cheap and fast, overridable. */
const DEFAULT_INVESTIGATOR_MODEL = "deepseek-v4-flash";
/** Default model for composer/adjudicator — better prose, overridable. */
const DEFAULT_REASONING_MODEL = "deepseek-v4-pro";

export class LlmUnavailableError extends DomainError {
  constructor() {
    super(
      "LLM_UNAVAILABLE",
      "No LLM is configured (OPENAI_API_KEY is empty). Live investigation of real properties " +
        "is disabled; deterministic fallbacks apply. See .env.example.",
    );
  }
}

export function isLlmConfigured(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

export function assertLlmConfigured(): void {
  if (!isLlmConfigured()) throw new LlmUnavailableError();
}

interface OpenAiCompatibleModel {
  providerId: string;
  modelId: string;
  url: string;
  apiKey?: string;
}

function veniceModel(modelId: string): OpenAiCompatibleModel {
  return {
    providerId: "venice",
    modelId,
    url: env.OPENAI_BASE_URL ?? VENICE_DEFAULT_BASE_URL,
    apiKey: env.OPENAI_API_KEY,
  };
}

/** Model used by the 6 investigator agents (OPENAI_INVESTIGATOR_MODEL override). */
export function investigatorModel(): OpenAiCompatibleModel {
  return veniceModel(process.env.OPENAI_INVESTIGATOR_MODEL || DEFAULT_INVESTIGATOR_MODEL);
}

/** Model used by assessment-composer and verdict-adjudicator (OPENAI_MODEL override). */
export function reasoningModel(): OpenAiCompatibleModel {
  return veniceModel(env.OPENAI_MODEL || DEFAULT_REASONING_MODEL);
}
