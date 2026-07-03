"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { VerdictBadge } from "./verdict-badge";
import { SourceList } from "./source-list";
import type { DomainSection } from "@/types";

export function DomainSectionCard({ section }: { section: DomainSection }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-2xl border border-primary-100 bg-surface p-5 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ink">{section.title}</h3>
          <p className="mt-1 text-sm text-ink-muted">{section.summary}</p>
        </div>
        <VerdictBadge verdict={section.verdict} />
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="mt-3 flex items-center gap-1 text-sm font-medium text-primary-700 hover:text-primary-800"
      >
        {expanded ? "Hide details" : "View details"}
        <ChevronDown
          className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 text-sm text-ink">
          <p className="whitespace-pre-line">{section.detail}</p>
          <SourceList sources={section.sources} confidence={section.confidence} />
        </div>
      )}
    </motion.section>
  );
}
