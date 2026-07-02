# ADR-005: Pino Structured Logging with AsyncLocalStorage Context

**Date:** 2025-05-05
**Status:** Accepted

## Context

We need structured, JSON-based logging that automatically includes request context (correlationId) without passing it through every function signature.

## Decision

Use Pino for structured logging, combined with Node.js AsyncLocalStorage to propagate request context. The logger reads correlationId from the async store automatically.

- `getLogger(category)` returns a logger with automatic context binding
- `runWithContext()` sets up the async store per request
- `apiHandler()` initiates the context and logs request lifecycle
- Log levels follow HTTP status: 5xx = error, 4xx = warn, success = info

## Alternatives Considered

- **Winston**: More features but heavier. Pino is faster and produces cleaner JSON.
- **Console.log with manual context**: No structure, no automatic context, hard to parse in production.
- **Explicit context passing**: Type-safe but pollutes every function signature. AsyncLocalStorage avoids this.

## Consequences

- Every log line includes `correlationId` automatically within a request context
- Outside a request context (e.g. startup), `correlationId` falls back to `'no-context'`
- Dev mode uses `pino-pretty` for human-readable output
- Production outputs JSON for log aggregation tools
- Logger lives in `infrastructure/logging/` — it's a technical concern, not domain
