"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { searchProperties } from "@/presentation/data/api";
import type { SearchResult } from "@/presentation/data/contracts";
import { StatusPill } from "@/presentation/ui/primitives/status-pill";
import { cx } from "@/presentation/ui/cx";

const DEBOUNCE_MS = 220;

/**
 * F0 entry point, always in the header: paste an address, UPRN, title number,
 * postcode or listing URL and jump to the sourced dossier.
 */
export function SearchBox({ className }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const runSearch = useCallback((value: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (value.trim().length < 2) {
      setResults([]);
      setOpen(false);
      setBusy(false);
      return;
    }
    setBusy(true);
    timerRef.current = setTimeout(async () => {
      try {
        const response = await searchProperties(value);
        setResults(response.results);
        setHighlight(0);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setBusy(false);
      }
    }, DEBOUNCE_MS);
  }, []);

  const go = useCallback(
    (result: SearchResult) => {
      setOpen(false);
      setQuery("");
      setResults([]);
      router.push(`/property/${encodeURIComponent(result.id)}`);
    },
    [router],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(results[highlight]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={cx("relative", className)}>
      <div className="flex items-center gap-2 rounded-(--radius-badge) border border-line bg-surface px-2.5 py-1.5 focus-within:border-primary/50">
        {busy ? (
          <Loader2
            aria-hidden
            className="h-4 w-4 shrink-0 animate-spin text-ink-secondary"
            strokeWidth={1.5}
          />
        ) : (
          <Search aria-hidden className="h-4 w-4 shrink-0 text-ink-secondary" strokeWidth={1.5} />
        )}
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            runSearch(event.target.value);
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Look up a property — address, UPRN, title no., postcode or listing URL"
          aria-label="Look up a property"
          className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-secondary/80"
        />
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-(--radius-card) border border-line bg-surface shadow-(--shadow-raised)">
          {results.length === 0 ? (
            <div className="px-3 py-2.5 text-[13px] text-ink-secondary">
              No match in the seeded portfolio.
            </div>
          ) : (
            <ul>
              {results.map((result, index) => (
                <li key={result.id}>
                  <button
                    type="button"
                    onClick={() => go(result)}
                    onMouseEnter={() => setHighlight(index)}
                    className={cx(
                      "flex w-full items-center justify-between gap-3 px-3 py-2 text-left",
                      index === highlight ? "bg-primary/5" : "bg-transparent",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-ink">{result.address}</span>
                      <span className="block font-mono text-[11px] text-ink-secondary">
                        {result.postcode} · {result.localAuthority}
                        {result.uprn ? ` · UPRN ${result.uprn}` : ""}
                      </span>
                    </span>
                    <StatusPill status={result.status} className="shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
