"use client";

import { useEffect, useState } from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/presentation/ui/primitives/button";

/**
 * "Export (PDF)" — a visual stub (spec F6: acceptable). The provenance ledger
 * is the casework artefact a reviewer would file; wiring a real server-side
 * PDF renderer is out of scope for the demo, so this states that honestly
 * rather than pretending to produce a document.
 */
export function ExportPdfButton({ total }: { total: number }) {
  const [note, setNote] = useState(false);

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(false), 4000);
    return () => clearTimeout(timer);
  }, [note]);

  return (
    <div className="relative">
      <Button
        variant="secondary"
        onClick={() => setNote((v) => !v)}
        title="Export the filtered ledger as a PDF casework file"
      >
        <FileDown aria-hidden className="h-3.5 w-3.5" strokeWidth={1.5} />
        Export (PDF)
      </Button>
      {note && (
        <div className="absolute right-0 top-full z-10 mt-1 w-64 rounded-(--radius-card) border border-line bg-surface p-2.5 text-[12px] leading-relaxed text-ink-secondary shadow-(--shadow-card)">
          <span className="font-medium text-ink">Visual stub.</span> A PDF of the{" "}
          {total.toLocaleString("en-GB")} filtered events would be filed to the casework record. The
          renderer is not wired up in the demo.
        </div>
      )}
    </div>
  );
}
