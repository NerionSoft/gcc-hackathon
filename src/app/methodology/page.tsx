import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sources & methodology — TerraVista",
};

interface SourceEntry {
  name: string;
  usage: string;
  frequency: string;
  limitation: string;
  url: string;
}

const SOURCES: SourceEntry[] = [
  {
    name: "IGN Géoplateforme — Base Adresse Nationale (BAN, French National Address Database)",
    usage: "Geocoding of the entered address (mandatory entry point).",
    frequency: "Continuous (address data updated in a live feed).",
    limitation:
      "Precision depends on the result type (house number, street, locality, commune) — a confidence score is displayed.",
    url: "https://data.geopf.fr/geocodage/search/",
  },
  {
    name: "Géorisques (BRGM / French Ministry for Ecological Transition)",
    usage:
      "Natural hazards (flood, clay shrink-swell, earthquake, radon, cavities), technological hazards, contaminated sites, CatNat natural-disaster declarations.",
    frequency:
      "Varies by sub-dataset; CatNat declarations are updated as they're published in the Journal Officiel.",
    limitation:
      "Some sub-datasets don't cover Paris, Lyon and Marseille at the same geographic scale: the detailed clay-hazard endpoint (/rga) is often empty, so we use the qualitative level from the summary endpoint instead; seismicity and radon are published per arrondissement, while CatNat and flood zones (AZI) are only published at the whole-city scale — TerraVista automatically queries both scales and keeps whichever responds.",
    url: "https://www.georisques.gouv.fr/doc-api",
  },
  {
    name: "Cerema — Land Data API (DVF open data)",
    usage:
      "Property transactions from the last 5 years around the address (median €/m², transaction map).",
    frequency: "Updated twice a year by the DGFiP, republished continuously by Cerema.",
    limitation:
      "Doesn't cover Mayotte or the Alsace-Moselle départements (local law). Transactions sometimes include atypical sales (bare land, grouped lots, bulk sales) that can strongly skew an isolated price per m² — the median over the local sample dampens this effect but doesn't eliminate it entirely. Endpoint is occasionally slow (a few seconds).",
    url: "https://apidf-preprod.cerema.fr/swagger/",
  },
  {
    name: "Atmo Data (AASQA federation)",
    usage: "Daily ATMO air-quality index (0-7 scale).",
    frequency: "Daily.",
    limitation:
      "Some rural communes, outside the local measurement network's coverage, aren't covered by the communal index — this is flagged explicitly rather than guessing a value. Fine-grained per-pollutant measurements (Geod'air) require prior registration and aren't integrated at this time.",
    url: "https://www.atmo-france.org",
  },
  {
    name: "SSMSI (Ministry of the Interior) — recorded crime",
    usage: "Annual communal crime statistics, as a rate per 1000 residents with trend.",
    frequency: "Twice a year (January and July).",
    limitation:
      "These are annual communal figures, never a street-by-street crime map. Communes with fewer than 5 recorded incidents over 3 consecutive years aren't published, to avoid statistically unreliable or individually-identifying rates — this isn't an absence of crime, only an absence of usable data. The source file (40MB) is updated twice a year: TerraVista pre-processes it (`pnpm fetch-data`) rather than querying it live on every request.",
    url: "https://www.data.gouv.fr/datasets/bases-statistiques-communale-departementale-et-regionale-de-la-delinquance-enregistree-par-la-police-et-la-gendarmerie-nationales/",
  },
  {
    name: "ADEME — Energy Performance Diagnostics (DPE)",
    usage: "Energy/climate rating, year built, living area of the nearest building.",
    frequency: "Continuous since July 2021 (new calculation method).",
    limitation:
      "Strict anonymisation required by the CNIL (French data protection authority): no owner name is exposed or consulted. A multi-unit building can have several diagnostics (one per unit) — TerraVista uses the most recent one found at the exact address, or failing that the immediate neighbourhood's (flagged). Diagnostics issued before July 2021 (old, since-discredited \"3CL\" method) aren't queried.",
    url: "https://data.ademe.fr",
  },
];

export default function MethodologyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-12 px-4 py-12 sm:px-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-primary-900">
          Sources &amp; methodology
        </h1>
        <p className="text-ink-muted">
          TerraVista is a free, neutral citizen tool: every claim in the report is linked to an
          official public source, with an explicit confidence level. Nothing is invented — when a
          piece of data is missing, the report says so.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-ink">The agentic loop</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-muted">
          <li>
            <strong className="text-ink">Planner</strong> — weighs the 5 domains (risks, price,
            air, safety, energy) based on your life profile and property type, deterministically
            (no model call, so no dependency on an API key for this step).
          </li>
          <li>
            <strong className="text-ink">Collectors</strong> — six Zod-typed Mastra tools, one per
            source, each with caching, exponential-backoff retry, and a confidence score on the
            data returned.
          </li>
          <li>
            <strong className="text-ink">Cascade</strong> — if flood risk exposure is detected, a
            follow-up search is automatically triggered to pin down the flood zone (Atlas des Zones
            Inondables), with no action needed from you.
          </li>
          <li>
            <strong className="text-ink">Analyst</strong> — cross-references the results to
            produce insights no single source gives on its own (e.g. high clay hazard + drought
            declaration + old house ⇒ cracking risk), and explicitly flags when the market doesn't
            seem to price in a documented risk.
          </li>
          <li>
            <strong className="text-ink">Advisor</strong> — composes the final report: weighted
            global score, prioritised red flags, and concrete actions (questions to ask, official
            steps to take).
          </li>
        </ol>
        <p className="text-sm text-ink-muted">
          The global score and per-domain verdicts are computed by deterministic code, not by a
          language model — the report stays identical and reliable even with no LLM key configured.
          A language model, when configured, is only used to rephrase some explanatory text, never
          to produce a number or a verdict.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-ink">Sources</h2>
        <div className="space-y-4">
          {SOURCES.map((s) => (
            <div
              key={s.name}
              className="rounded-2xl border border-primary-100 bg-surface p-5 shadow-sm"
            >
              <h3 className="text-base font-semibold text-ink">{s.name}</h3>
              <dl className="mt-2 space-y-1 text-sm text-ink-muted">
                <div>
                  <dt className="inline font-medium text-ink">Usage: </dt>
                  <dd className="inline">{s.usage}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-ink">Frequency: </dt>
                  <dd className="inline">{s.frequency}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-ink">Limitations: </dt>
                  <dd className="inline">{s.limitation}</dd>
                </div>
              </dl>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm text-primary-600 hover:underline"
              >
                {s.url}
              </a>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-ink">Confidence and resilience</h2>
        <p className="text-sm text-ink-muted">
          Every source returns a status ("ok", "partial", "unavailable", or "error") and a
          confidence level (high / medium / low). If a source is unavailable, the report is still
          produced: the corresponding section explicitly shows "data unavailable" instead of an
          invented value, and the domain is excluded from the global score calculation (it is
          neither favoured nor penalised for being absent).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-ink">Ethics and data protection</h2>
        <p className="text-sm text-ink-muted">
          TerraVista only processes public data about a property and its commune — never personal
          data about individuals. Crime statistics (SSMSI) are annual communal rates: they never
          geolocate an incident to a precise address, and TerraVista never presents them as such.
          Energy diagnostics (ADEME) are anonymised at the source by the CNIL — no owner name is
          ever exposed. No search data is retained beyond the time needed to compute the report.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-ink">Known limitations</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-ink-muted">
          <li>Price data (DVF) can include atypical sales that skew a local median.</li>
          <li>
            The Cerema API (DVF) sometimes takes several seconds to respond; the price section can
            arrive after the others.
          </li>
          <li>
            Fine-grained per-pollutant air quality (Geod'air) isn't integrated — only the daily
            ATMO index is.
          </li>
          <li>
            Radon potential and the detailed clay hazard aren't systematically published by
            Géorisques for every commune.
          </li>
          <li>
            Automatically monitoring an address over time (new building permit, new CatNat
            declaration) isn't implemented yet.
          </li>
        </ul>
      </section>
    </main>
  );
}
