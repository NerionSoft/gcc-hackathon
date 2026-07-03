# TerraVista

**A free, neutral, citizen-facing tool for understanding a property's environment before you sign.**

An address and a life profile go in; a sourced, weighted report comes out — natural hazards,
market prices, air quality, safety, energy performance — produced by a team of agents that
perceives, plans, collects, cross-references, and decides, with full traceability back to
official French public data.

## Quick start

Prerequisites: Node ≥ 24, pnpm 11 (`packageManager` in `package.json` — `corepack enable` handles this automatically).

```bash
pnpm install
cp .env.example .env      # optional — everything works without a key
pnpm fetch-data           # regenerates the local SSMSI index (committed, so skippable)
pnpm dev                  # http://localhost:3000
```

No external service is required to run the app: the 6 sources are open APIs with no key needed
(except where noted below), and the report is produced entirely without an LLM configured — the
score, verdicts, and red flags are all computed by deterministic code. An LLM, if configured
(`OPENAI_API_KEY` / `OPENAI_BASE_URL`, routed through Mastra's built-in model router — compatible
with any OpenAI-compatible endpoint), would only reword some explanatory text — this layer isn't
wired up yet, and the report stays 100% functional without it.

Two pre-verified demo addresses are offered directly on the search screen (the "Or try a demo
address" section):

- **8 Rue de la Paix, Paris 2e** — urban apartment, documented flood zone, high clay shrink-swell risk.
- **Venelle de l'Église, Huelgoat (29)** — old rural house, underground cavities, elevated radon
  potential, repeated natural-disaster history. Triggers two cross-domain red flags (structural
  check + market/risk arbitration).

## Architecture — the agentic loop

```
Address + profile
      │
      ▼
┌─────────────┐   deterministic: weighs the 5 domains by profile
│   Planner   │   (family, remote work, air sensitivity, investment, senior)
└──────┬──────┘   and property type (house / apartment)
       │
       ▼ (the 5 collectors run in parallel, each section renders
┌──────┴──────┐    as soon as it's ready — never a screen frozen for 30s)
│  Collectors │
│  risks      │──▶ Géorisques (BRGM)
│  prices     │──▶ Cerema — Données Foncières API (DVF)
│  air        │──▶ Atmo Data
│  safety     │──▶ SSMSI (pre-computed local index)
│  energy     │──▶ ADEME DPE
└──────┬──────┘
       │  cascade: if flooding is detected, a follow-up lookup
       │  (Atlas des Zones Inondables) fires automatically
       ▼
┌─────────────┐   deterministic: cross-references results for findings
│   Analyst   │   no single source gives, arbitrates contradictions
└──────┬──────┘   between sources (e.g. documented risk vs. a price that ignores it)
       │
       ▼
┌─────────────┐   composes the final report: weighted score, prioritized
│   Advisor   │   red flags, concrete actions (questions, official steps)
└──────┬──────┘
       ▼
  Streamed report (NDJSON) → progressive report screen + PDF export
```

Each stage is a `step` of a real **Mastra workflow** (`src/mastra/workflows/report-workflow.ts`),
and each source is a Zod-typed **Mastra tool** (`src/mastra/tools/`). The workflow emits progress
events via `writer.custom(...)` (Mastra's native mechanism, verified end to end), which the
`/api/report/stream` route translates into NDJSON for the client. The same workflow also runs in
batch mode (`run.start(...)`, no streaming) for PDF export — one business logic, two execution modes.

**Deliberate architecture choice**: the Planner, Analyst, and Advisor are deterministic code, not
LLM calls. The report has to be reliable and reproducible even with no API key configured; a
language model would only add value by rewording text, never by producing a number or a verdict.
This choice is documented in more detail on `/methodology`.

## Sources

Six tools, each with caching, exponential-backoff retry, and a confidence score on the data
returned. Per-source details (update frequency, known limitations) live on the app's **Sources &
methodology** page (`/methodology`):

| Domain | Source | Notes |
| --- | --- | --- |
| Geocoding | IGN Géoplateforme — Base Adresse Nationale | Mandatory entry point |
| Risks | Géorisques (BRGM) | Flooding, clay shrink-swell, seismic, radon, cavities, contaminated sites, CatNat, AZI |
| Prices | Cerema — Données Foncières API (DVF open data) | Last 5 years; doesn't cover Mayotte / Alsace-Moselle |
| Air | Atmo Data (daily ATMO index) | Geod'air (fine-grained per-pollutant measurements) requires registration, not integrated |
| Safety | SSMSI (municipal crime data) | Pre-computed local index (`pnpm fetch-data`) — the source file (~40 MB) is too slow to query live |
| Energy | ADEME — DPE | Anonymized (CNIL); the most recent DPE for the exact address, or the immediate neighborhood otherwise |

## Tech stack

Next.js 16 (App Router, Turbopack) · React 19 · strict TypeScript · Mastra (agents, tools,
workflows) · Zod · Tailwind CSS v4 · TanStack Query · MapLibre GL (IGN basemaps) ·
Framer Motion · @react-pdf/renderer · Vitest · Playwright.

## Scripts

```bash
pnpm dev              # development server
pnpm build            # production build
pnpm test             # unit tests (Vitest)
pnpm test:e2e         # end-to-end tests (Playwright, network fully mocked)
pnpm lint             # ESLint
pnpm typecheck        # tsc --noEmit
pnpm format           # Prettier --write
pnpm fetch-data       # regenerates data/ssmsi/index.json.gz (committed — skippable in normal use)
```

## Project structure

```
src/
  app/                 Next.js routes (screens + API routes)
  mastra/
    tools/             6 Mastra tools (1 per source, cache + retry + confidence)
    agents/            Planner, Analyst, Advisor (deterministic)
    workflows/         the Mastra workflow that orchestrates everything
  components/screens/  search-screen and report-screen UI
  components/pdf/      PDF export template
  types/               shared Zod schemas (address, profile, domains, report, stream)
  lib/                 http (retry/backoff), cache (memory + disk), stats, geo
scripts/
  fetch-ssmsi.ts       pre-computes the SSMSI municipal index (see methodology)
tests/
  unit/                Vitest — tools, agents
  e2e/                 Playwright — critical path, mocked network
```

## Known limitations

See the `/methodology` page for full detail. In short: price data (DVF) can include atypical
sales that skew a local median; the Cerema (DVF) API sometimes takes several seconds to respond;
fine-grained per-pollutant air quality (Geod'air) isn't integrated; detailed radon potential and
clay shrink-swell hazard aren't systematically published by Géorisques for every municipality;
automatic tracking of an address over time (a bonus item from the brief) isn't implemented.
