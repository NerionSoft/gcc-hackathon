# ADR-006: Authentication Architecture (better-auth + Port/Adapter)

**Date:** 2025-05-05
**Status:** Accepted

## Context

The starter needs authentication with multi-tenancy support (organizations), while remaining swappable for enterprise scenarios (centralized OIDC provider). Auth has two distinct concerns: identity resolution ("who is calling?") and authorization ("can they do this?"). These should not live in the same layer.

## Decision

### Identity resolution is infrastructure, authorization is per-hexagone

- **Shared kernel** (`src/shared/auth/`) owns `AuthContext` type, `AuthContextProvider` port, generic guards (`requireAuth`, `requireAdmin`, `requireOrganization`), and auth errors (`UnauthorizedError`, `ForbiddenError`).
- **Infrastructure** (`src/infrastructure/auth/better-auth/`) owns the better-auth adapter that implements `AuthContextProvider`.
- **Each hexagone** owns its own guard functions as plain functions taking `AuthContext`. No central permission registry.

### Separate auth context storage

`AuthContext` uses its own `AsyncLocalStorage`, separate from `RequestContext`. Auth is opt-in: use cases that need it call `getAuthContext()`. Public routes don't populate it.

### Organization = organizationId, not a domain Tenant

The starter ships `organizationId` in `AuthContext`. It does not define a `Tenant` domain entity. Consumers map `organizationId` to their own domain concept.

### Auth errors are not domain errors

`UnauthorizedError` and `ForbiddenError` have their own class hierarchy (not extending `DomainError`). `apiHandler` gets dedicated branches for 401/403.

### Only better-auth ships; the port is the seam

The `AuthContextProvider` interface exists so an enterprise OIDC adapter can be written later. We don't build it now.

### Open for extension, closed for modification

- OAuth2: add social providers to `betterAuth()` config
- 2FA (global and per-action): add `twoFactor()` plugin
- Enterprise OIDC: implement `AuthContextProvider`, swap in `infrastructure/auth/index.ts`

## Alternatives Considered

- **Auth as its own hexagone**: Too heavy for glue code around better-auth. The domain layer would be thin, and every other hexagone depends on it (shared kernel, not a bounded context).
- **Auth in infrastructure only**: Business rules (guards, capabilities) would leak into infrastructure.
- **Central permission registry** (like error-to-HTTP registry): Adds indirection for no cross-boundary need. Permissions are consumed inside hexagones, not across layers.
- **Enrich `RequestContext` with auth fields**: Couples every request to auth. Makes testing harder. Muddies infrastructure vs business concern.
- **Auth errors extending `DomainError`**: Semantically wrong. Authentication failure is not a domain concept.
- **Ship a `Tenant` Prisma model**: The starter can't define a domain entity it doesn't own. Consumers decide what `organizationId` maps to.

## Consequences

- Adding a new auth provider means implementing one interface (`AuthContextProvider`) and swapping the export in `infrastructure/auth/index.ts`.
- Adding permissions to a hexagone means writing a guard function locally — no shared files touched.
- Consumers must map `organizationId` to their domain concept themselves.
- The proxy resolves auth state; route handlers and use cases consume it via `getAuthContext()`.
- `apiHandler` must handle three error families: `DomainError`, `ZodError`, and auth errors.
