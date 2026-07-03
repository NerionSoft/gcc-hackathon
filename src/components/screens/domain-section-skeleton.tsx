import { DOMAIN_META } from "./domain-meta";
import type { DomainKey } from "@/types";

export function DomainSectionSkeleton({ domain }: { domain: DomainKey }) {
  const { title, icon: Icon } = DOMAIN_META[domain];
  return (
    <div
      className="animate-pulse rounded-2xl border border-primary-100 bg-surface p-5 shadow-sm"
      aria-busy="true"
    >
      <div className="flex items-center gap-2 text-ink-muted">
        <Icon className="h-4 w-4" aria-hidden />
        <span className="text-sm">{title}</span>
      </div>
      <div className="mt-3 h-3 w-3/4 rounded bg-primary-100" />
      <div className="mt-2 h-3 w-1/2 rounded bg-primary-100" />
    </div>
  );
}
