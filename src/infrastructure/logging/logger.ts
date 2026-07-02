import pino from "pino";
import { getRequestContext } from "@/infrastructure/runtime/request-context";
import { env } from "@/infrastructure/config/env";

const baseLogger = pino({
  level: env.LOG_LEVEL || (env.isDev ? "debug" : "info"),
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(env.isDev && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    },
  }),
});

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

function getContextBindings(): Record<string, unknown> {
  const ctx = getRequestContext();
  if (!ctx) return {};
  return {
    correlationId: ctx.correlationId,
  };
}

export function getLogger(category: string): Logger {
  const child = baseLogger.child({ category });

  function wrapChild(pinoChild: pino.Logger): Logger {
    return {
      debug: (msg, data) => pinoChild.debug({ ...getContextBindings(), ...data }, msg),
      info: (msg, data) => pinoChild.info({ ...getContextBindings(), ...data }, msg),
      warn: (msg, data) => pinoChild.warn({ ...getContextBindings(), ...data }, msg),
      error: (msg, data) => pinoChild.error({ ...getContextBindings(), ...data }, msg),
      child: (bindings) => wrapChild(pinoChild.child(bindings)),
    };
  }

  return wrapChild(child);
}
