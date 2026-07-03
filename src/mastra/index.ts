import { Mastra } from "@mastra/core";
import { LibSQLStore } from "@mastra/libsql";
import {
  blockScanner,
  buildingInspector,
  landSurveyor,
  marketAnalyst,
  peopleInvestigator,
  unitProfiler,
} from "@/mastra/agents/investigators";
import { assessmentComposer } from "@/mastra/agents/assessment-composer";
import { verdictAdjudicator } from "@/mastra/agents/verdict-adjudicator";
import { civicRiskScanWorkflow } from "@/mastra/workflows/civic-risk-scan";

export const CIVIC_RISK_SCAN_WORKFLOW = "civic-risk-scan";

/**
 * The Mastra backend: 6 investigators + composer + adjudicator, the
 * civic-risk-scan workflow, and LibSQL storage so suspended runs survive
 * process restarts (the review gates resume across HTTP requests).
 *
 * Singleton via globalThis so Next.js dev-mode module reloads don't spawn
 * parallel instances against the same storage file.
 */
function buildMastra(): Mastra {
  return new Mastra({
    agents: {
      "building-inspector": buildingInspector,
      "unit-profiler": unitProfiler,
      "block-scanner": blockScanner,
      "people-investigator": peopleInvestigator,
      "land-surveyor": landSurveyor,
      "market-analyst": marketAnalyst,
      "assessment-composer": assessmentComposer,
      "verdict-adjudicator": verdictAdjudicator,
    },
    workflows: {
      [CIVIC_RISK_SCAN_WORKFLOW]: civicRiskScanWorkflow,
    },
    storage: new LibSQLStore({
      id: "cpi-mastra-storage",
      url: "file:data/mastra.db",
    }),
  });
}

const globalRef = globalThis as typeof globalThis & { __cpiMastra?: Mastra };

export function getMastra(): Mastra {
  globalRef.__cpiMastra ??= buildMastra();
  return globalRef.__cpiMastra;
}
