# ADR-003: Registry-Based Error-to-HTTP Status Mapping

**Date:** 2025-05-05
**Status:** Accepted

## Context

The API error handler needs to translate domain error codes to HTTP status codes. A naive approach (hardcoded map in the handler) couples infrastructure to all domains — every new hexagone would add entries to the same file.

## Decision

Use a registry pattern: the error handler exposes `registerErrorMappings()`, and each hexagone registers its own mappings from its `adapters/http/` layer during server startup (`instrumentation.ts`).

```ts
// infrastructure/http/api-handler.ts
const errorStatusRegistry: Record<string, number> = {};
export function registerErrorMappings(mappings: Record<string, number>): void {
  Object.assign(errorStatusRegistry, mappings);
}

// example-hexagone/adapters/http/example-error-mappings.ts
export const exampleErrorMappings = {
  EXAMPLE_NOT_FOUND: 404,
  EXAMPLE_INVALID: 422,
  EXAMPLE_INVALID_STATE_TRANSITION: 409,
};

// instrumentation.ts
registerErrorMappings(exampleErrorMappings);
```

## Alternatives Considered

- **Hardcoded map in error handler**: Simple but creates coupling — infrastructure depends on every domain.
- **Error carries its own HTTP status**: Leaks HTTP into the domain layer — breaks hexagonal purity.
- **Convention-based** (infer from code suffix/pattern): Fragile, implicit.

## Consequences

- The error handler is domain-agnostic — it never imports from any hexagone
- Each hexagone owns its error-to-HTTP translation in its adapter layer
- Adding a new hexagone requires one line in `instrumentation.ts`
- Unmapped error codes default to 500
