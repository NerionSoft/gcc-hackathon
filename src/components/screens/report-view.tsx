"use client";

import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { AlertCircle, Download } from "lucide-react";
import { useReportStream } from "@/lib/use-report-stream";
import { ScoreGauge } from "./score-gauge";
import { RedFlagCard } from "./red-flag-card";
import { DomainSectionCard } from "./domain-section-card";
import { DomainSectionSkeleton } from "./domain-section-skeleton";
import { ActionItems } from "./action-items";
import { domainKeySchema } from "@/types";

const ReportMap = dynamic(() => import("./report-map").then((m) => m.ReportMap), {
  ssr: false,
  loading: () => <div className="h-80 w-full animate-pulse rounded-2xl bg-primary-100 sm:h-96" />,
});

export function ReportView() {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();

  const label = searchParams.get("label") ?? "";
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));

  const state = useReportStream(queryString || null);
  const allDomains = domainKeySchema.options;

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6">
      <header className="space-y-1">
        <p className="text-sm font-medium uppercase tracking-wide text-primary-500">Rapport</p>
        <h1 className="text-2xl font-semibold text-ink sm:text-3xl">{label}</h1>
        {state.planReasoning && <p className="text-sm text-ink-muted">{state.planReasoning}</p>}
      </header>

      {state.errors.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-alerte bg-alerte-bg p-4 text-sm text-alerte">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <ul>
            {state.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {state.report ? (
        <ScoreGauge score={state.report.globalScore} explanation={state.report.scoreExplanation} />
      ) : (
        <div
          className="h-40 animate-pulse rounded-2xl bg-primary-50"
          aria-busy="true"
          aria-label="Calcul du score en cours"
        />
      )}

      {state.redFlags.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-ink">Points de vigilance prioritaires</h2>
          <div className="space-y-3">
            {state.redFlags.map((f) => (
              <RedFlagCard key={f.id} finding={f} />
            ))}
          </div>
        </section>
      )}

      {!Number.isNaN(lat) && !Number.isNaN(lon) && (
        <ReportMap lat={lat} lon={lon} layers={state.report?.mapLayers ?? null} />
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">Analyse par domaine</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Fixed slot order (not arrival order) so the grid doesn't reflow as sections stream in. */}
          {allDomains.map((domain) => {
            const section = state.sections.find((s) => s.domain === domain);
            return section ? (
              <DomainSectionCard key={domain} section={section} />
            ) : (
              <DomainSectionSkeleton key={domain} domain={domain} />
            );
          })}
        </div>
      </section>

      {state.report && (
        <>
          <ActionItems actions={state.report.actions} />
          <div className="flex justify-end">
            <a
              href={`/api/report/pdf?${queryString}`}
              className="flex items-center gap-2 rounded-xl border border-primary-200 px-4 py-2.5 text-sm font-medium text-primary-700 hover:bg-primary-50"
            >
              <Download className="h-4 w-4" aria-hidden />
              Exporter en PDF
            </a>
          </div>
        </>
      )}
    </main>
  );
}
