"use client";

import { useState } from "react";
import { Loader2, Radar } from "lucide-react";
import { requestFreshScan } from "@/presentation/data/api";
import { Button } from "@/presentation/ui/primitives/button";

/**
 * F0 "run fresh scan": posts to the scan endpoint. Today that endpoint is the
 * documented stub; when the engine worker replaces the handler, this button
 * starts a real six-investigator scan without any change here.
 */
export function RunScanButton({ propertyId }: { propertyId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await requestFreshScan(propertyId);
      setMessage(response.message);
    } catch {
      setMessage("The scan request failed — is the dev server running?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="primary" onClick={run} disabled={busy}>
        {busy ? (
          <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
        ) : (
          <Radar aria-hidden className="h-3.5 w-3.5" strokeWidth={1.5} />
        )}
        Run fresh scan
      </Button>
      {message && (
        <p className="max-w-xs text-right font-mono text-[11px] leading-snug text-ink-secondary">
          {message}
        </p>
      )}
    </div>
  );
}
