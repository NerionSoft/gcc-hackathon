import type { Severity } from "@/db/schema";
import { SEVERITY_META } from "@/presentation/ui/severity";
import { cx } from "@/presentation/ui/cx";

/**
 * Rectangular severity badge (SPEC §6): discreet, 4px radius, colour = severity.
 * `neutral` variant for non-severity labels (dimension codes, counts…).
 */
export function SeverityBadge({
  severity,
  children,
  className,
}: {
  severity: Severity;
  children?: React.ReactNode;
  className?: string;
}) {
  const meta = SEVERITY_META[severity];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-(--radius-badge) border px-1.5 py-px font-mono text-[11px] font-medium uppercase tracking-wide",
        className,
      )}
      style={{ color: meta.color, backgroundColor: meta.tint, borderColor: meta.edge }}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-[1px]"
        style={{ backgroundColor: meta.color }}
      />
      {children ?? meta.label}
    </span>
  );
}

export function NeutralBadge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-(--radius-badge) border border-line bg-background px-1.5 py-px font-mono text-[11px] font-medium uppercase tracking-wide text-ink-secondary",
        className,
      )}
    >
      {children}
    </span>
  );
}
