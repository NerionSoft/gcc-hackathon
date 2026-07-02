import { NextResponse } from "next/server";
import { ZodError, flattenError } from "zod";
import { DomainError } from "@/shared/errors/domain-error";
import { UnauthorizedError } from "@/shared/auth/errors/unauthorized.error";
import { ForbiddenError } from "@/shared/auth/errors/forbidden.error";
import { runWithAuthContext } from "@/shared/auth/auth-context";
import { authContextProvider } from "@/infrastructure/auth";
import { env } from "@/infrastructure/config/env";
import { getLogger } from "@/infrastructure/logging/logger";
import { runWithContext, getCorrelationId } from "@/infrastructure/runtime/request-context";

const logger = getLogger("API");

// ============================================
// ERROR CODE → HTTP STATUS MAPPING (registry)
// ============================================

export type ErrorHttpMapping = Record<string, number>;

const errorStatusRegistry: ErrorHttpMapping = {};

export function registerErrorMappings(mappings: ErrorHttpMapping): void {
  Object.assign(errorStatusRegistry, mappings);
}

// ============================================
// STANDARD RESPONSE FORMAT
// ============================================

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    correlationId: string;
    details?: unknown;
  };
}

function getHttpStatus(error: unknown): number {
  if (error instanceof UnauthorizedError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof DomainError) {
    return errorStatusRegistry[error.code] || 500;
  }
  if (error instanceof ZodError) return 400;
  return 500;
}

function formatErrorResponse(error: unknown): ErrorResponse {
  const correlationId = getCorrelationId();
  const isDev = env.isDev;

  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        correlationId,
      },
    };
  }

  if (error instanceof DomainError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        correlationId,
        ...(isDev && error.context ? { details: error.context } : {}),
      },
    };
  }

  if (error instanceof ZodError) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        correlationId,
        details: flattenError(error),
      },
    };
  }

  const message = error instanceof Error ? error.message : "Internal server error";
  return {
    error: {
      code: "INTERNAL_ERROR",
      message: isDev ? message : "Internal server error",
      correlationId,
      ...(isDev && error instanceof Error && { details: { stack: error.stack } }),
    },
  };
}

// ============================================
// apiHandler HOF
// ============================================

const SAFE_HEADER_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function sanitizeHeader(value: string | null): string | undefined {
  return value !== null && SAFE_HEADER_RE.test(value) ? value : undefined;
}

type ApiHandler = (
  req: Request,
  context?: { params?: Promise<Record<string, string>> },
) => Promise<Response>;

export function apiHandler(handler: ApiHandler): ApiHandler {
  return async (req, context) => {
    const correlationId =
      sanitizeHeader(req.headers.get("x-correlation-id")) ?? crypto.randomUUID();

    return runWithContext({ correlationId }, async () => {
      const startTime = Date.now();
      const url = new URL(req.url);

      logger.info("Request received", {
        method: req.method,
        path: url.pathname,
      });

      try {
        const authContext = await authContextProvider.resolve(req.headers);

        const run = async () => handler(req, context);
        const response = authContext ? await runWithAuthContext(authContext, run) : await run();

        logger.info("Request completed", {
          method: req.method,
          path: url.pathname,
          status: response.status,
          durationMs: Date.now() - startTime,
        });

        if (response instanceof NextResponse) {
          response.headers.set("x-correlation-id", correlationId);
        }

        return response;
      } catch (error) {
        const status = getHttpStatus(error);
        const body = formatErrorResponse(error);

        const logData = {
          method: req.method,
          path: url.pathname,
          status,
          durationMs: Date.now() - startTime,
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                  ...(error instanceof DomainError && {
                    code: error.code,
                    context: error.context,
                  }),
                }
              : { message: String(error) },
        };

        if (status >= 500) {
          logger.error("Server error", logData);
        } else if (status >= 400) {
          logger.warn("Client error", logData);
        }

        const response = NextResponse.json(body, { status });
        response.headers.set("x-correlation-id", correlationId);
        return response;
      }
    });
  };
}
