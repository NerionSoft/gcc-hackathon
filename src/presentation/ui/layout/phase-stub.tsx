import type { LucideIcon } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/presentation/ui/primitives/card";

/**
 * Honest placeholder for screens whose engine-side features land in later
 * phases. Never presents simulated parts as real (SPEC §9) — it says plainly
 * what is coming and from where.
 */
export function PhaseStub({
  icon: Icon,
  title,
  description,
  items,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  items: readonly string[];
}) {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <Card>
        <CardHeader title={title} />
        <CardBody className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-(--radius-badge) border border-line bg-background">
              <Icon aria-hidden className="h-4 w-4 text-primary" strokeWidth={1.5} />
            </span>
            <p className="text-[13px] leading-relaxed text-ink">{description}</p>
          </div>
          <ul className="list-disc space-y-1 pl-9 text-[13px] text-ink-secondary">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
