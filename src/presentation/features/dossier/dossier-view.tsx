import { EyeOff, MapPin } from "lucide-react";
import type { RiskSignal } from "@/db/schema";
import type { DossierResponse } from "@/presentation/data/contracts";
import { RunScanButton } from "@/presentation/features/dossier/run-scan-button";
import { NeutralBadge, SeverityBadge } from "@/presentation/ui/primitives/badge";
import { Card, CardBody, CardHeader } from "@/presentation/ui/primitives/card";
import { ConfidenceMeter } from "@/presentation/ui/primitives/confidence-meter";
import { SourceLink } from "@/presentation/ui/primitives/source-link";
import { StatusPill } from "@/presentation/ui/primitives/status-pill";
import { DIMENSION_LABEL, SEVERITY_ORDER, worstSeverity } from "@/presentation/ui/severity";
import { formatGBP, formatInt } from "@/presentation/ui/format";
import { dimensionCodeSchema } from "@/db/schema";

/**
 * F0 — the full sourced dossier: from a raw address to every finding with its
 * severity, clickable public record, confidence and rationale, in one screen.
 */
export function DossierView({ dossier }: { dossier: DossierResponse }) {
  const { property, signals, adjudication } = dossier;
  const adverse = signals
    .filter((signal) => signal.severity !== "green")
    .sort(
      (a, b) =>
        SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] ||
        a.signalCode.localeCompare(b.signalCode),
    );
  const provisional = worstSeverity(signals.map((signal) => signal.severity));
  const verdict = adjudication?.compositeVerdict ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-4 py-2">
      {/* Identity */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-ink">{property.address}</h1>
            <StatusPill status={property.status} />
            <NeutralBadge>
              {property.provenance === "real_open_data"
                ? "real open data"
                : "synthetic (scale demo)"}
            </NeutralBadge>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12px] text-ink-secondary">
            <span>{property.postcode}</span>
            <span>{property.localAuthority}</span>
            {property.uprn && <span>UPRN {property.uprn}</span>}
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden className="h-3 w-3" strokeWidth={1.5} />
              {property.lat.toFixed(5)}, {property.lng.toFixed(5)}
            </span>
            <span>id {property.id}</span>
          </p>
        </div>
        <RunScanButton propertyId={property.id} />
      </div>

      {/* Scenario metadata — simulated, and labelled as such (SPEC §9) */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-(--radius-card) border border-line bg-surface px-4 py-3 shadow-(--shadow-card) sm:grid-cols-5">
        <Fact label="Type" value={property.propertyType.replace("_", " ")} />
        <Fact label="Tenure" value={property.tenure} />
        <Fact label="Capital at stake" value={formatGBP(property.value)} mono />
        <Fact label="Capital type" value={property.capitalType} />
        <Fact label="Intended use" value={property.intendedUse} />
        <p className="col-span-full font-mono text-[10px] text-ink-secondary">
          value / intended use / capital type are simulated scenario metadata — see README
        </p>
      </div>

      {/* Composite verdict */}
      <Card>
        <CardHeader
          title="Composite risk verdict"
          aside={
            verdict ? (
              <SeverityBadge severity={verdict} />
            ) : (
              <NeutralBadge>awaiting adjudication</NeutralBadge>
            )
          }
        />
        <CardBody>
          {verdict && adjudication ? (
            <div className="space-y-2">
              <p className="text-[13px] leading-relaxed text-ink">
                {adjudication.verdictRationale}
              </p>
              {adjudication.escalationReason && (
                <p className="font-mono text-[11px] text-severity-red">
                  escalated: {adjudication.escalationReason}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink">
                {provisional ? (
                  <>
                    Worst extracted signal severity:
                    <SeverityBadge severity={provisional} />
                  </>
                ) : (
                  "No signals extracted yet."
                )}
              </p>
              <p className="text-[12px] leading-relaxed text-ink-secondary">
                The composite verdict is issued by the adjudication engine, always with a rationale
                citing its evidence — and the decision to commit capital stays human, without
                exception. It lands here with the engine phases.
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* What the listing doesn't mention */}
      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-1.5">
              <EyeOff aria-hidden className="h-3.5 w-3.5" strokeWidth={1.5} />
              What the listing doesn&apos;t mention
            </span>
          }
          aside={<NeutralBadge>{formatInt(adverse.length)} adverse signals</NeutralBadge>}
        />
        <CardBody className="p-0">
          {adverse.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-ink-secondary">
              {signals.length === 0
                ? "Nothing extracted yet — this property has not been scanned."
                : "No amber or red signal in the extracted evidence."}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {adverse.map((signal) => (
                <SignalRow key={signal.id} signal={signal} />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Full evidence, by dimension */}
      <Card>
        <CardHeader
          title="All extracted signals"
          aside={
            <NeutralBadge>{formatInt(signals.length)} findings · every one sourced</NeutralBadge>
          }
        />
        <CardBody className="p-0">
          {signals.length === 0 ? (
            <p className="px-4 py-4 text-[13px] leading-relaxed text-ink-secondary">
              No stored signals. This is one of the 50 real properties investigated live by the
              agent team — findings appear here once the scan engine lands. No evidence, no finding:
              this dossier never shows an unsourced claim.
            </p>
          ) : (
            dimensionCodeSchema.options.map((code) => {
              const dimensionSignals = signals.filter((signal) => signal.dimensionCode === code);
              if (dimensionSignals.length === 0) return null;
              return (
                <section key={code} className="border-b border-line last:border-b-0">
                  <h3 className="bg-background px-4 py-1.5 font-mono text-[11px] font-medium uppercase tracking-widest text-ink-secondary">
                    {DIMENSION_LABEL[code]} · {code}
                  </h3>
                  <ul className="divide-y divide-line">
                    {dimensionSignals.map((signal) => (
                      <SignalRow key={signal.id} signal={signal} detailed />
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium uppercase tracking-wide text-ink-secondary">
        {label}
      </div>
      <div
        className={
          mono ? "truncate font-mono text-[13px] text-ink" : "truncate text-[13px] text-ink"
        }
      >
        {value}
      </div>
    </div>
  );
}

function SignalRow({ signal, detailed = false }: { signal: RiskSignal; detailed?: boolean }) {
  return (
    <li className="flex flex-col gap-1 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={signal.severity} />
        <span className="font-mono text-[11px] text-ink-secondary">{signal.signalCode}</span>
        <span className="ml-auto">
          <ConfidenceMeter value={signal.confidence} />
        </span>
      </div>
      <p className="text-[13px] leading-relaxed text-ink">{signal.finding}</p>
      {detailed && (
        <p className="text-[12px] leading-relaxed text-ink-secondary">{signal.rationale}</p>
      )}
      <div>
        <SourceLink sourceRef={signal.sourceRef} showRetrievedAt />
      </div>
    </li>
  );
}
