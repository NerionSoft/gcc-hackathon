import { MessageCircleQuestion, Stamp, ClipboardCheck, Landmark } from "lucide-react";
import type { ActionCategory, ActionItem } from "@/types";

const CATEGORY_META: Record<ActionCategory, { label: string; icon: typeof MessageCircleQuestion }> =
  {
    question_vendeur: { label: "Question au vendeur", icon: MessageCircleQuestion },
    question_notaire: { label: "Question au notaire", icon: Stamp },
    verification: { label: "Vérification à demander", icon: ClipboardCheck },
    demarche_officielle: { label: "Démarche officielle", icon: Landmark },
  };

export function ActionItems({ actions }: { actions: ActionItem[] }) {
  if (actions.length === 0) return null;

  return (
    <section className="rounded-2xl border border-primary-100 bg-surface p-5 shadow-sm">
      <h3 className="text-base font-semibold text-ink">À faire avant de signer</h3>
      <ul className="mt-4 space-y-3">
        {actions.map((action, i) => {
          const { label, icon: Icon } = CATEGORY_META[action.category];
          return (
            <li key={i} className="flex items-start gap-3">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" aria-hidden />
              <div>
                <p className="text-sm font-medium text-ink">{action.title}</p>
                <p className="text-xs text-ink-muted">{action.reason}</p>
                <span className="mt-0.5 inline-block text-[11px] uppercase tracking-wide text-primary-500">
                  {label}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
