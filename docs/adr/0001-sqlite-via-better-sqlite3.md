# ADR 0001 — Business model storage: SQLite via better-sqlite3 (not Drizzle)

**Status:** accepted · **Date:** 2026-07-03 · **Phase:** 1 (foundation)

## Context

The spec mandates local SQLite for the business model (no external services;
`pnpm install && pnpm dev` must be enough) and Zod validation on every
boundary. The choice left open was the access layer: Drizzle ORM or plain
`better-sqlite3`.

## Decision

Plain **better-sqlite3** with hand-written DDL and a thin typed access layer,
validated by the **Zod schemas as the single source of truth** for entity
shapes.

## Rationale

- The spec already requires Zod schemas for every entity. With Drizzle we
  would maintain the same model twice (Drizzle table DSL + Zod), or add a
  generator bridge — more moving parts for zero demo value.
- The hard invariants ("no RiskSignal without complete sourceRef +
  confidence", "AuditEvent is append-only") live in **our** access-layer
  functions either way; an ORM does not enforce them for us. A small
  hand-rolled layer keeps those guarantees in one obvious place, plus SQLite
  triggers as defence in depth.
- better-sqlite3 is synchronous, which keeps seed scripts and deterministic
  workflow steps simple, and it needs no codegen or migration tooling — the
  database is disposable and rebuilt from `scripts/seed.ts`.
- Mastra keeps its own LibSQL/SQLite storage for workflow state (later
  phases); the two stores stay independent.

## Consequences

- Schema changes mean editing DDL + Zod together in `src/db/` — acceptable
  for a hackathon-scale, seed-rebuilt database.
- No query builder; access functions expose intent-revealing methods instead
  of ad-hoc SQL at call sites.
