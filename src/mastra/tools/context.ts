import { noopObserve } from "@mastra/core/tools";
import type { ToolExecutionContext } from "@mastra/core/tools";

/**
 * Every collector tool is called directly by the workflow (deterministic API
 * fetchers, not LLM tool-calls), so we never get a runtime-supplied
 * execution context. This satisfies Tool.execute's required `context` arg.
 */
export const directToolContext: ToolExecutionContext = { observe: noopObserve };
