"use client";

import { motion } from "framer-motion";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";
import { SourceList } from "./source-list";
import type { CrossRuleFinding, Severity } from "@/types";

const SEVERITY_STYLES: Record<Severity, { icon: typeof Info; className: string; border: string }> =
  {
    info: { icon: Info, className: "text-primary-600", border: "border-primary-200" },
    vigilance: { icon: AlertTriangle, className: "text-vigilance", border: "border-vigilance" },
    alerte: { icon: AlertCircle, className: "text-alerte", border: "border-alerte" },
  };

export function RedFlagCard({ finding }: { finding: CrossRuleFinding }) {
  const { icon: Icon, className, border } = SEVERITY_STYLES[finding.severity];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={`rounded-2xl border-l-4 bg-surface p-4 shadow-sm ${border}`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${className}`} aria-hidden />
        <div className="flex-1 space-y-2">
          <h4 className="text-sm font-semibold text-ink">{finding.title}</h4>
          <p className="text-sm text-ink-muted">{finding.explanation}</p>
          <SourceList sources={finding.sources} confidence={finding.confidence} />
        </div>
      </div>
    </motion.div>
  );
}
