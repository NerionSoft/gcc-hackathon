import { cx } from "@/presentation/ui/cx";

/** Confidence 0–1 as a mono percentage plus a thin neutral bar (no colour: confidence is not severity). */
export function ConfidenceMeter({ value, className }: { value: number; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <span
      className={cx("inline-flex items-center gap-1.5", className)}
      title={`Confidence ${pct}%`}
    >
      <span className="h-1 w-12 overflow-hidden rounded-[1px] bg-line">
        <span className="block h-full bg-primary/70" style={{ width: `${pct}%` }} />
      </span>
      <span className="font-mono text-[11px] text-ink-secondary tabular-nums">{pct}%</span>
    </span>
  );
}
