# ADR-004: Module as Per-Hexagone Composition Root

**Date:** 2025-05-05
**Status:** Accepted

## Context

Use cases depend on repository ports. Something needs to wire the concrete adapter (Prisma, in-memory) to the port. The wiring should happen in one place per hexagone, not scattered across route files.

## Decision

Each hexagone has a `<name>.module.ts` at its root. It instantiates adapters, injects them into use cases via constructor injection, and exports the pre-wired use cases as the hexagone's public API.

```ts
// example-hexagone/example.module.ts
const repository = new InMemoryExampleRepository();
export const createExampleUseCase = new CreateExampleUseCase(repository);
```

Routes import from the module, never from adapters directly.

## Alternatives Considered

- **Centralized composition root** (single file for all DI, like .NET `Startup.cs`): Becomes a god file at scale.
- **Use cases import from module** (reverse direction): Breaks the dependency rule — application layer would depend on the composition root. Also creates circular import risk.
- **DI container library** (tsyringe, inversify): Adds decorators, configuration, and magic. Overkill at this scale.
- **Factory functions**: Functionally equivalent to modules but less discoverable.

## Consequences

- Routes are thin consumers — they know nothing about adapters
- Swapping an adapter (e.g. in-memory → Prisma) means changing one file per hexagone
- Module file grows linearly with use cases — if it gets too big, the hexagone should be split
- Constructor injection keeps use cases pure and easily testable (pass a mock in tests)
