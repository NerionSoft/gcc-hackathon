import { cx } from "@/presentation/ui/cx";

/** Dense label-over-figure stat, mono digits (SPEC §6 typography). */
export function MetricStat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cx("min-w-0", className)}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-ink-secondary">
        {label}
      </div>
      <div className="font-mono text-lg font-medium leading-tight text-ink tabular-nums">
        {value}
      </div>
      {hint && <div className="truncate text-[11px] text-ink-secondary">{hint}</div>}
    </div>
  );
}
