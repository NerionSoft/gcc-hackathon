# Architecture Overview

This starter follows **hexagonal architecture** (ports & adapters), organized by bounded contexts called **hexagones**.

## Dependency Rule

Inner layers never depend on outer layers. Dependencies always point inward:

```
┌──────────────────────────────────────────────────────┐
│  Infrastructure                                      │
│  (frameworks, DB, HTTP, logging, runtime services)   │
├──────────────────────────────────────────────────────┤
│  Application                                         │
│  (use cases, DTOs, ports, queries)                   │
├──────────────────────────────────────────────────────┤
│  Domain                                              │
│  (entities, value objects, domain errors)             │
└──────────────────────────────────────────────────────┘
```

- **Domain** knows nothing about the outside world
- **Application** depends only on domain
- **Infrastructure** depends on application and domain
- **Adapters** implement ports defined in the application layer

## Project Structure

```
src/
├── shared/                          ← Shared kernel (cross-hexagone primitives)
│   └── errors/
│       └── domain-error.ts          ← Base error class used by all hexagones
│
├── <name>-hexagone/                 ← One bounded context
│   ├── domain/                      ← Pure business rules
│   │   ├── entities/                ← Domain entities with factory methods
│   │   ├── value-objects/           ← Enums, typed values
│   │   └── errors/                  ← Domain-specific error subclasses
│   ├── application/                 ← Orchestration
│   │   ├── usecases/                ← Business logic entry points
│   │   ├── ports/                   ← Repository interfaces (contracts)
│   │   ├── dto/                     ← Input validation (Zod schemas)
│   │   └── queries/                 ← Query objects (filter, sort, pagination)
│   ├── adapters/                    ← Concrete implementations
│   │   ├── prisma/                  ← Database adapter
│   │   │   ├── repositories/        ← Port implementations
│   │   │   └── mappers/             ← Domain ↔ persistence mapping
│   │   ├── http/                    ← HTTP-specific adapter concerns
│   │   │   └── error-mappings.ts    ← Error code → HTTP status mapping
│   │   └── in-memory/               ← In-memory adapter (dev/testing)
│   │       └── repositories/
│   └── <name>.module.ts             ← Composition root (wires adapters to ports)
│
├── infrastructure/                  ← Cross-cutting technical concerns
│   ├── runtime/
│   │   └── request-context.ts       ← AsyncLocalStorage (correlationId, locale)
│   ├── logging/
│   │   └── logger.ts                ← Pino structured logger with context injection
│   ├── http/
│   │   ├── api-handler.ts           ← API handler HOF (auth context, error handling, logging)
│   │   └── proxy/                   ← Next.js proxy middleware chain
│   └── db/
│       └── prisma-client.ts         ← Prisma singleton with Neon adapter
│
├── app/                             ← Next.js App Router (delivery mechanism)
│   └── api/                         ← API routes (thin, delegate to use cases)
│
├── instrumentation.ts               ← Server startup hook (registers error mappings)
└── proxy.ts                         ← Next.js request interception
```

## Request Flow

```
HTTP Request
  ↓
proxy.ts                         ← Request interception (auth, locale, headers)
  ↓
app/api/.../route.ts             ← Thin route handler
  ↓
apiHandler()               ← Sets up AsyncLocalStorage context, wraps with error handling
  ↓
Zod schema.parse()               ← Input validation (throws ZodError → 400)
  ↓
useCase.execute()                ← Application layer orchestration
  ↓
repository.method()              ← Port call, resolved to concrete adapter
  ↓
Response or DomainError          ← Success → JSON, Error → mapped HTTP status + structured log
```

## Error Flow

```
Domain layer:  throw new ExampleNotFoundError({ exampleId })
                  ↓
Application:   error bubbles up through use case
                  ↓
Infrastructure: apiHandler catches it
                  ↓
                errorStatusRegistry[error.code] → HTTP status
                formatErrorResponse()           → { error: { code, message, correlationId } }
                logger.warn/error               → structured Pino log with context
```

Each hexagone registers its own error-to-HTTP status mappings in `instrumentation.ts`, keeping the error handler domain-agnostic.

## Key Principles

1. **Services throw domain errors, never HTTP responses.** The infrastructure translates.
2. **Error codes are the contract.** Consumers check `error.code`, not `error.message`.
3. **Each hexagone is self-contained.** It owns its domain, application, adapters, and module.
4. **The module is the public API.** Routes import use cases from the module, never from adapters directly.
5. **Shared kernel is minimal.** Only truly cross-cutting primitives (like `DomainError`) live in `src/shared/`.
6. **Infrastructure is generic.** It knows about ports and domain errors, but never about specific hexagones.
