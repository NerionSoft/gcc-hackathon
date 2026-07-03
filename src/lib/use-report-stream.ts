"use client";

import { useEffect, useRef, useState } from "react";
import type {
  DomainKey,
  DomainSection,
  CrossRuleFinding,
  Report,
  ReportStreamEvent,
} from "@/types";

export interface ReportStreamState {
  planReasoning: string | null;
  toolsPlanned: DomainKey[];
  toolsInFlight: DomainKey[];
  sections: DomainSection[];
  redFlags: CrossRuleFinding[];
  cascadeNotes: string[];
  report: Report | null;
  errors: string[];
  isDone: boolean;
}

const INITIAL_STATE: ReportStreamState = {
  planReasoning: null,
  toolsPlanned: [],
  toolsInFlight: [],
  sections: [],
  redFlags: [],
  cascadeNotes: [],
  report: null,
  errors: [],
  isDone: false,
};

function applyEvent(state: ReportStreamState, event: ReportStreamEvent): ReportStreamState {
  switch (event.type) {
    case "plan":
      return { ...state, planReasoning: event.reasoning, toolsPlanned: event.toolsPlanned };
    case "tool-start":
      return { ...state, toolsInFlight: [...state.toolsInFlight, event.tool] };
    case "section-ready":
      return {
        ...state,
        sections: [
          ...state.sections.filter((s) => s.domain !== event.section.domain),
          event.section,
        ],
        toolsInFlight: state.toolsInFlight.filter((t) => t !== event.section.domain),
      };
    case "cascade":
      return {
        ...state,
        cascadeNotes: [...state.cascadeNotes, event.reasoning],
        toolsPlanned: [...new Set([...state.toolsPlanned, ...event.extraTools])],
      };
    case "redflag":
      return { ...state, redFlags: [...state.redFlags, event.finding] };
    case "report-complete":
      return { ...state, report: event.report, isDone: true };
    case "error":
      return { ...state, errors: [...state.errors, event.message] };
    default:
      return state;
  }
}

/**
 * Consumes the NDJSON stream from /api/report/stream — one ReportStreamEvent
 * per line — so the report screen renders each domain section the moment
 * its agent finishes, instead of waiting for the whole report.
 */
export function useReportStream(queryString: string | null): ReportStreamState {
  const [state, setState] = useState<ReportStreamState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!queryString) return;
    setState(INITIAL_STATE);

    const controller = new AbortController();
    abortRef.current = controller;

    async function run() {
      try {
        const res = await fetch(`/api/report/stream?${queryString}`, { signal: controller.signal });
        if (!res.body) throw new Error("The server did not return a stream.");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as ReportStreamEvent;
            setState((prev) => applyEvent(prev, event));
          }
        }
        setState((prev) => (prev.isDone ? prev : { ...prev, isDone: true }));
      } catch (err) {
        if (controller.signal.aborted) return;
        setState((prev) => ({
          ...prev,
          errors: [
            ...prev.errors,
            err instanceof Error ? err.message : "Stream connection error.",
          ],
          isDone: true,
        }));
      }
    }

    void run();
    return () => controller.abort();
  }, [queryString]);

  return state;
}
