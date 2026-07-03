import { isValidationError, type ValidationError } from "@mastra/core/tools";

/**
 * Every collector tool is called directly by the workflow (never through an
 * LLM tool-call, and none use suspend/approval), so `execute` always
 * resolves to the typed result envelope in practice. `Tool.execute`'s type
 * signature still allows `ValidationError | void` for the general case —
 * this narrows that away once instead of at every call site.
 */
export async function execTool<T>(
  promise: Promise<T | ValidationError<unknown> | void>,
): Promise<T> {
  const result = await promise;
  if (result === undefined) throw new Error("tool.execute unexpectedly returned void");
  if (isValidationError(result))
    throw new Error(`tool.execute input validation failed: ${JSON.stringify(result)}`);
  return result;
}
