import { CheckCircle2, AlertTriangle, AlertCircle, HelpCircle } from "lucide-react";
import type { Verdict } from "@/types";

const VERDICT_STYLES: Record<
  Verdict,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  favorable: {
    label: "Favorable",
    icon: CheckCircle2,
    className: "bg-favorable-bg text-favorable",
  },
  vigilance: {
    label: "Vigilance",
    icon: AlertTriangle,
    className: "bg-vigilance-bg text-vigilance",
  },
  alerte: { label: "Alert", icon: AlertCircle, className: "bg-alerte-bg text-alerte" },
  indisponible: {
    label: "Data unavailable",
    icon: HelpCircle,
    className: "bg-indisponible-bg text-indisponible",
  },
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const { label, icon: Icon, className } = VERDICT_STYLES[verdict];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${className}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </span>
  );
}
