import pino from "pino";

/**
 * Structured decision log: every Planner/Analyste/Conseiller decision goes
 * through here as a typed event, not a free-text console.log — this is what
 * lets the demo prove the "agentic" claim (what was queried, why, with what
 * confidence) instead of asserting it.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport:
    process.env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
      : undefined,
});

export function logAgentDecision(
  agent: string,
  decision: string,
  context: Record<string, unknown>,
): void {
  logger.info({ agent, decision, ...context }, `[${agent}] ${decision}`);
}
