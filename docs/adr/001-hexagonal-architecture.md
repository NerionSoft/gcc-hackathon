# ADR-001: Hexagonal Architecture with Bounded Contexts

**Date:** 2025-05-05
**Status:** Accepted

## Context

We need a scalable architecture for a Next.js platform starter that supports multiple domains and clean separation of concerns.

## Decision

Adopt hexagonal architecture (ports & adapters) with each bounded context as a self-contained "hexagone" directory.

## Structure

```
src/<name>-hexagone/
├── domain/          ← entities, value objects, errors
├── application/     ← use cases, ports, DTOs, queries
├── adapters/        ← prisma, in-memory, http
└── <name>.module.ts ← composition root
```

## Alternatives Considered

...

## Consequences

- Each hexagone is independently testable by swapping adapters
- Adding a new bounded context is a matter of creating a new `<name>-hexagone/` directory
- Slightly more boilerplate than a flat structure, but scales better
