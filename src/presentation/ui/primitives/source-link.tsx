import { ExternalLink } from "lucide-react";
import type { SourceRef } from "@/db/schema";
import { cx } from "@/presentation/ui/cx";

/**
 * The omnipresent, visually identifiable link to the public record backing a
 * finding (SPEC §1: evidence beats assertion; §6: source links everywhere).
 * Mono type for dataset + record id, always clickable to the real URL.
 */
export function SourceLink({
  sourceRef,
  showRetrievedAt = false,
  className,
}: {
  sourceRef: SourceRef;
  showRetrievedAt?: boolean;
  className?: string;
}) {
  return (
    <a
      href={sourceRef.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${sourceRef.dataset} · record ${sourceRef.recordId}`}
      className={cx(
        "inline-flex max-w-full items-center gap-1 rounded-(--radius-badge) border border-line bg-background px-1.5 py-px font-mono text-[11px] text-primary underline decoration-line underline-offset-2 hover:border-primary/40 hover:decoration-primary/60",
        className,
      )}
    >
      <ExternalLink aria-hidden className="h-3 w-3 shrink-0" strokeWidth={1.5} />
      <span className="truncate">
        {sourceRef.dataset}
        <span className="text-ink-secondary"> · {sourceRef.recordId}</span>
        {showRetrievedAt && (
          <span className="text-ink-secondary">
            {" "}
            · retrieved {sourceRef.retrievedAt.slice(0, 10)}
          </span>
        )}
      </span>
    </a>
  );
}
