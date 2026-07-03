"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, Search, ShieldAlert } from "lucide-react";
import type { AdjudicationActionKind } from "@/presentation/data/contracts";
import type { AdjudicationBoardItem } from "@/presentation/data/contracts";
import { actOnAdjudication } from "@/presentation/data/api";
import { SeverityBadge } from "@/presentation/ui/primitives/badge";
import { Button } from "@/presentation/ui/primitives/button";
import { formatTimestamp } from "@/presentation/ui/format";
import { cx } from "@/presentation/ui/cx";

/**
 * One escalated (red) case with the analyst's three actions. There is NO
 * auto-resolve control — spec §9: red cases are never resolved automatically,
 * even as a hidden option. "Mark resolved" is a deliberate human action and
 * requires a written justification (the engine enforces this too).
 */
export function EscalatedCase({
  item,
  fresh,
  onDone,
}: {
  item: AdjudicationBoardItem;
  fresh: boolean;
  onDone: () => void;
}) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<AdjudicationActionKind | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const act = async (action: AdjudicationActionKind) => {
    if (action === "mark_resolved" && comment.trim().length === 0) {
      setErr("Resolving a red verdict requires a written justification.");
      return;
    }
    setBusy(action);
    setErr(null);
    try {
      await actOnAdjudication(item.id, action, comment.trim() || undefined);
      setComment("");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The action failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.li
      animate={{
        backgroundColor: fresh ? "rgba(192,57,43,0.05)" : "rgba(0,0,0,0)",
      }}
      transition={{ duration: 0.5 }}
      className="px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={item.compositeVerdict ?? "red"} />
        <Link
          href={`/property/${encodeURIComponent(item.propertyId)}`}
          className="text-[13px] font-medium text-ink hover:text-primary hover:underline"
        >
          {item.address}
        </Link>
        <span className="font-mono text-[11px] text-ink-secondary">{item.localAuthority}</span>
        {item.escalationReason && (
          <span className="rounded-(--radius-badge) border border-line bg-background px-1.5 py-px font-mono text-[11px] text-severity-red">
            {item.escalationReason.replaceAll("_", " ")}
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] text-ink-secondary">
          {formatTimestamp(item.lastActivityAt)}
        </span>
      </div>

      {item.latestEvidence && (
        <p className="mt-1.5 text-[12px] text-ink">
          <span className="font-mono text-[11px] uppercase tracking-wide text-ink-secondary">
            incoming evidence:{" "}
          </span>
          {item.latestEvidence}
        </p>
      )}
      {item.verdictRationale && (
        <p className="mt-1 text-[12px] leading-relaxed text-ink-secondary">
          {item.verdictRationale}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Decision note (required to resolve)…"
          className="min-w-0 flex-1 rounded-(--radius-badge) border border-line bg-background px-2.5 py-1.5 text-[12px] text-ink placeholder:text-ink-secondary focus:border-primary/50 focus:outline-none"
        />
        <Button
          variant="secondary"
          onClick={() => void act("confirm_risk")}
          disabled={busy !== null}
        >
          {busy === "confirm_risk" ? (
            <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
          ) : (
            <ShieldAlert aria-hidden className="h-3.5 w-3.5" strokeWidth={1.5} />
          )}
          Confirm risk
        </Button>
        <Button
          variant="secondary"
          onClick={() => void act("request_more_evidence")}
          disabled={busy !== null}
        >
          {busy === "request_more_evidence" ? (
            <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
          ) : (
            <Search aria-hidden className="h-3.5 w-3.5" strokeWidth={1.5} />
          )}
          Request more evidence
        </Button>
        <Button
          variant="secondary"
          onClick={() => void act("mark_resolved")}
          disabled={busy !== null || comment.trim().length === 0}
          title="Requires a written justification"
        >
          {busy === "mark_resolved" ? (
            <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
          ) : (
            <CheckCircle2 aria-hidden className="h-3.5 w-3.5" strokeWidth={1.5} />
          )}
          Mark resolved
        </Button>
      </div>
      {err && <p className={cx("mt-1 font-mono text-[11px] text-severity-red")}>{err}</p>}
    </motion.li>
  );
}
