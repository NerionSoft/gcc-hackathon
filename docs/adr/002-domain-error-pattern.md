# ADR-002: Typed Domain Errors with DomainError Base Class

**Date:** 2025-05-05
**Status:** Accepted

## Context

Services need to express business rule violations in a way that is:

- Type-safe (each error carries structured context)
- Domain-pure (no HTTP or framework concepts)
- Translatable to HTTP responses by the infrastructure layer

## Decision

Create a generic `DomainError<T>` base class in the shared kernel (`src/shared/errors/`). Each hexagone defines its own subclasses with typed context, a machine-readable code, and optional group/action tags.

```ts
export class DomainError<T extends object = object> extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly context?: T,
    public readonly group?: string,
    public readonly action?: string,
  ) { ... }
}
```

## Alternatives Considered

- **Error codes as enums**: Less flexible, no typed context per error.
- **Result types** (Either/Result pattern): More functional, but heavier to adopt across the codebase and less idiomatic in the Node.js/TypeScript ecosystem.
- **HTTP exceptions** (like NestJS HttpException): Couples domain to HTTP — breaks hexagonal purity.

## Consequences

- Domain errors are thrown in use cases, caught and translated in infrastructure
- Error codes (`EXAMPLE_NOT_FOUND`) become the stable contract between layers
- Each error's context is typed — no `any` or generic `Record<string, unknown>`
- `DomainError` lives in `src/shared/errors/` as part of the shared kernel
