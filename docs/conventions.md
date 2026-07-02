# Conventions

## Naming

### Directories

| Pattern                  | Example             | Usage                       |
| ------------------------ | ------------------- | --------------------------- |
| `<name>-hexagone/`       | `example-hexagone/` | Bounded context             |
| `domain/entities/`       |                     | Domain entities             |
| `domain/value-objects/`  |                     | Enums, typed values         |
| `domain/errors/`         |                     | Domain error subclasses     |
| `application/usecases/`  |                     | Business logic entry points |
| `application/ports/`     |                     | Repository interfaces       |
| `application/dto/`       |                     | Input schemas (Zod)         |
| `application/queries/`   |                     | Query objects               |
| `adapters/<technology>/` | `adapters/prisma/`  | Concrete implementations    |

### Files

| Pattern                          | Example                           | Usage                              |
| -------------------------------- | --------------------------------- | ---------------------------------- |
| `<name>.entity.ts`               | `example.entity.ts`               | Domain entity                      |
| `<name>.enum.ts`                 | `example-status.enum.ts`          | Value object / enum                |
| `<name>.errors.ts`               | `example.errors.ts`               | All errors for a domain (one file) |
| `<name>.repository.ts`           | `example.repository.ts`           | Port interface                     |
| `<name>.usecase.ts`              | `create-example.usecase.ts`       | Use case (verb-noun)               |
| `<name>.dto.ts`                  | `create-example.dto.ts`           | DTO with Zod schema                |
| `<name>.query.ts`                | `example.query.ts`                | Query object                       |
| `<name>.module.ts`               | `example.module.ts`               | Composition root per hexagone      |
| `<name>-error-mappings.ts`       | `example-error-mappings.ts`       | Error code → HTTP status           |
| `prisma-<name>.repository.ts`    | `prisma-example.repository.ts`    | Prisma adapter                     |
| `in-memory-<name>.repository.ts` | `in-memory-example.repository.ts` | In-memory adapter                  |

## Domain Errors

- One errors file per hexagone: `domain/errors/<name>.errors.ts`
- Each error is a subclass of `DomainError<ContextType>`
- Constructor takes only the context object (code and message are fixed per class)
- Context interface is defined and exported alongside the error class

```ts
export interface ExampleNotFoundCtx {
  exampleId: string;
}

export class ExampleNotFoundError extends DomainError<ExampleNotFoundCtx> {
  constructor(ctx: ExampleNotFoundCtx) {
    super("EXAMPLE_NOT_FOUND", "Example not found", ctx, "example", "fetch");
  }
}
```

Error code convention: `UPPER_SNAKE_CASE`, prefixed with the domain name.

## Error-to-HTTP Mapping

Each hexagone owns its mappings in `adapters/http/<name>-error-mappings.ts` and registers them in `src/instrumentation.ts`:

```ts
registerErrorMappings(exampleErrorMappings);
```

The API error handler never imports from a hexagone directly.

## Module (Composition Root)

Each hexagone has a `<name>.module.ts` at its root that:

- Instantiates adapters
- Wires adapters into use cases via constructor injection
- Exports pre-wired use cases as the hexagone's public API

Routes import from the module, never from adapters or use case constructors directly.

## API Routes

Routes are thin — they validate input, call a use case, and return a response:

```ts
import { createExampleUseCase } from "@/example-hexagone/example.module";

export const POST = apiHandler(async (req: Request) => {
  const body = CreateExampleDtoSchema.parse(await req.json());
  const example = await createExampleUseCase.execute(body);
  return NextResponse.json(example, { status: 201 });
});
```

All routes are wrapped with `apiHandler()`.

## Logging

Use `getLogger(category)` for structured logging. The logger automatically injects `correlationId` from the request context:

```ts
const logger = getLogger("OrderService");
logger.info("Order created", { orderId: order.id });
```

Log levels follow HTTP status: 5xx = error, 4xx = warn, 2xx = info.

## Dependencies Direction

Allowed imports:

```
shared/          ← anyone can import
domain/          ← application, adapters can import
application/     ← adapters can import
adapters/        ← only the module imports
module           ← only routes and instrumentation import
infrastructure/  ← only adapters, routes, and instrumentation import
```

Forbidden imports:

- Domain must never import from application, adapters, or infrastructure
- Application must never import from adapters or infrastructure
- Infrastructure must never import from a specific hexagone (use registries)
