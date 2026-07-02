# ADR-007: Centralized Environment Config Service

**Date:** 2025-05-06
**Status:** Accepted

## Context

Environment variables were accessed via raw `process.env` calls scattered across infrastructure modules (database client, logger, auth config, error handler). This leads to:

- No fail-fast on missing required variables — the app crashes later with cryptic errors.
- No typing — `process.env.FOO` is always `string | undefined`.
- No single place for computed values derived from raw variables (e.g., base URL fallback chain).
- `computed-env.ts` existed solely for base URL computation, duplicating env access patterns.

## Decision

A single config service at `src/infrastructure/config/env.ts` validates, types, and computes all environment variables.

### Structure

```ts
// Raw vars: validated at module load time
const raw = {
  DATABASE_URL: requireEnv('DATABASE_URL'),       // throws if missing
  BETTER_AUTH_SECRET: requireEnv('BETTER_AUTH_SECRET'),
  NEXT_PUBLIC_APP_URL: optionalEnv('NEXT_PUBLIC_APP_URL'),
  // ...
};

// Computed: derived from raw vars
export const env = {
  ...raw,
  baseUrl: /* first of APP_URL / VERCEL_URL / localhost */,
  baseUrls: /* deduplicated list */,
  isProduction: raw.NODE_ENV === 'production',
  isDev: raw.NODE_ENV !== 'production',
} as const;
```

### Rules

- All `process.env` access goes through `env.*`. No direct `process.env` reads in application or infrastructure code.
- Required variables use `requireEnv()` — the app crashes immediately at startup if missing.
- Optional variables use `optionalEnv()` — returns `undefined` if absent.
- Computed values are derived from raw variables in the same module.
- The `env` object is `as const` for maximum type narrowing.

### No external dependency

Hand-rolled with two helper functions (`requireEnv`, `optionalEnv`). No validation library needed; all environment variables are strings, and coercion (numbers, booleans) can be added to the computed section when needed.

## Alternatives Considered

- **`@t3-oss/env-nextjs`**: Couples to Next.js and requires Zod. The starter should not impose a validation library for env vars.
- **`envalid`**: Framework-agnostic, but adds a dependency for what is effectively two helper functions.
- **Raw `process.env` with `instrumentation.ts` validation**: Validates at startup but doesn't provide typed access or computed values.
- **Lazy validation (`getEnv()`)**: Defers failure to first access instead of startup. Harder to diagnose.

## Consequences

- Missing required variables cause an immediate, clear error at startup.
- All env access is typed: `env.DATABASE_URL` is `string`, not `string | undefined`.
- Computed values (base URLs, `isDev`, `isProduction`) are centralized and consistent.
- `computed-env.ts` is removed — its logic is absorbed into the config service.
- Adding a new variable means one edit in `env.ts`. All consumers import from the same place.
