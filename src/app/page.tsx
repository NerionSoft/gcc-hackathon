import { SearchForm } from "@/components/screens/search-form";
import { ShieldCheck, Landmark, Wind, Users, Zap } from "lucide-react";

const SOURCES = [
  { label: "IGN — Base Adresse Nationale", icon: Landmark },
  { label: "Géorisques (BRGM)", icon: ShieldCheck },
  { label: "DVF (DGFiP)", icon: Landmark },
  { label: "Atmo Data / Geod'air", icon: Wind },
  { label: "SSMSI (Ministry of the Interior)", icon: Users },
  { label: "ADEME (DPE)", icon: Zap },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12 sm:px-6 sm:py-16">
      <div className="space-y-4 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-primary-900 sm:text-4xl">
          Analyze your future home
        </h1>
        <p className="mx-auto max-w-xl text-balance text-base text-ink-muted sm:text-lg">
          An address, a life profile: a team of agents cross-references French public data to
          produce a sourced report — risks, prices, air, safety, energy — before you sign.
        </p>
      </div>

      <SearchForm />

      <div className="text-center text-sm text-ink-muted">
        <p className="mb-3">A free, neutral citizen tool — official sources only:</p>
        <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          {SOURCES.map(({ label, icon: Icon }) => (
            <li key={label} className="flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 text-primary-400" aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
