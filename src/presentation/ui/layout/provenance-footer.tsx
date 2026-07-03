/** Permanent provenance footer — exact wording is binding (SPEC §6). */
export function ProvenanceFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="mx-auto max-w-450 px-4 py-2.5">
        <p className="font-mono text-[11px] leading-relaxed text-ink-secondary">
          Data: HM Land Registry, EPC (MHCLG), Environment Agency, police.uk, Companies House,
          planning.data.gov.uk — Open Government Licence v3.0
        </p>
      </div>
    </footer>
  );
}
