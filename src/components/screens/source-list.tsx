import { ExternalLink } from "lucide-react";
import type { ConfidenceLevel, SourceRef } from "@/types";

const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

export function SourceList({
  sources,
  confidence,
}: {
  sources: SourceRef[];
  confidence: ConfidenceLevel;
}) {
  return (
    <div className="space-y-2 border-t border-primary-100 pt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        Sources — {CONFIDENCE_LABELS[confidence]}
      </p>
      <ul className="space-y-1">
        {sources.map((source) => (
          <li key={source.url}>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
            >
              {source.name}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
            <span className="ml-1.5 text-xs text-ink-muted">
              retrieved {new Date(source.retrievedAt).toLocaleDateString("en-GB")}
              {source.datasetVintage ? ` · ${source.datasetVintage}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
