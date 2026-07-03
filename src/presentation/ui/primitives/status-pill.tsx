import type { PropertyStatus } from "@/db/schema";
import {
  SEVERITY_META,
  STATUS_LABEL,
  STATUS_TONE,
  type StatusTone,
} from "@/presentation/ui/severity";
import { cx } from "@/presentation/ui/cx";

const TONE_STYLE: Record<StatusTone, { color: string; bg: string; border: string }> = {
  neutral: { color: "#6B6B66", bg: "#FAFAF8", border: "#E5E5E0" },
  muted: { color: "#9B9B94", bg: "#FAFAF8", border: "#ECECE7" },
  active: { color: "#1B2A4A", bg: "#EEF1F6", border: "#CBD3E1" },
  green: {
    color: SEVERITY_META.green.color,
    bg: SEVERITY_META.green.tint,
    border: SEVERITY_META.green.edge,
  },
  amber: {
    color: SEVERITY_META.amber.color,
    bg: SEVERITY_META.amber.tint,
    border: SEVERITY_META.amber.edge,
  },
  red: {
    color: SEVERITY_META.red.color,
    bg: SEVERITY_META.red.tint,
    border: SEVERITY_META.red.edge,
  },
};

/** Rectangular workflow-status pill. Colour only where status implies severity. */
export function StatusPill({ status, className }: { status: PropertyStatus; className?: string }) {
  const style = TONE_STYLE[STATUS_TONE[status]];
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-(--radius-badge) border px-1.5 py-px font-mono text-[11px] font-medium tracking-wide",
        className,
      )}
      style={{ color: style.color, backgroundColor: style.bg, borderColor: style.border }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
