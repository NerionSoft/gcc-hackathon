import { execTool } from "../tools/exec-tool";
import { directToolContext } from "../tools/context";
import { risksTool } from "../tools/risks";
import { pricesTool } from "../tools/prices";
import { airTool } from "../tools/air";
import { crimeTool } from "../tools/crime";
import { energyTool } from "../tools/energy";
import {
  investigatorAgent,
  assessorAgent,
  assessmentSchema,
  type Assessment,
} from "./investigator";
import {
  buildRisquesSection,
  buildPrixSection,
  buildAirSection,
  buildSecuriteSection,
  buildEnergieSection,
  computeGlobalScore,
  mapLayersFrom,
} from "./conseiller";
import { analyzeCrossRules } from "./analyst";
import {
  domainKeySchema,
  DOMAIN_TITLES,
  type Address,
  type UserProfile,
  type PropertyListing,
  type DomainKey,
  type DomainSection,
  type CrossRuleFinding,
  type Report,
  type ReportStreamEvent,
  type SourceRef,
  type ConfidenceLevel,
  type ToolResult,
  type AziZone,
  type RisksData,
  type PricesData,
  type AirData,
  type CrimeData,
  type EnergyData,
} from "@/types";

type Emit = (event: ReportStreamEvent) => Promise<void>;

export interface AgenticInput {
  address: Address;
  profile: UserProfile;
  listing: PropertyListing;
  weights: Record<DomainKey, number>;
}

interface Captured {
  risques?: ToolResult<RisksData>;
  prix?: ToolResult<PricesData>;
  air?: ToolResult<AirData>;
  securite?: ToolResult<CrimeData>;
  energie?: ToolResult<EnergyData>;
}

const CORE_DOMAINS = domainKeySchema.options;
const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { high: 3, medium: 2, low: 1 };

function isDomain(name: unknown): name is DomainKey {
  return typeof name === "string" && (CORE_DOMAINS as readonly string[]).includes(name);
}

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

/** Deterministic, grounded section straight from a real tool result — used both for the instant stream and as the merge base. */
function sectionFor(
  domain: DomainKey,
  captured: Captured,
  weights: Record<DomainKey, number>,
  listing: PropertyListing,
): DomainSection | null {
  switch (domain) {
    case "risques":
      return captured.risques ? buildRisquesSection(captured.risques, weights.risques) : null;
    case "prix":
      return captured.prix ? buildPrixSection(captured.prix, listing, weights.prix) : null;
    case "air":
      return captured.air ? buildAirSection(captured.air, weights.air) : null;
    case "securite":
      return captured.securite ? buildSecuriteSection(captured.securite, weights.securite) : null;
    case "energie":
      return captured.energie ? buildEnergieSection(captured.energie, weights.energie) : null;
  }
}

function unavailableSection(domain: DomainKey, weight: number): DomainSection {
  return {
    domain,
    title: DOMAIN_TITLES[domain],
    verdict: "indisponible",
    summary: "Data unavailable for this address.",
    detail: "This source was not reached during the investigation.",
    sources: [],
    confidence: "low",
    weight,
  };
}

function sourceForDomain(domain: DomainKey, captured: Captured): SourceRef | undefined {
  const map: Record<DomainKey, ToolResult<unknown> | undefined> = {
    risques: captured.risques,
    prix: captured.prix,
    air: captured.air,
    securite: captured.securite,
    energie: captured.energie,
  };
  return map[domain]?.source;
}

function confidenceForDomain(domain: DomainKey, captured: Captured): ConfidenceLevel {
  const map: Record<DomainKey, ToolResult<unknown> | undefined> = {
    risques: captured.risques,
    prix: captured.prix,
    air: captured.air,
    securite: captured.securite,
    energie: captured.energie,
  };
  return map[domain]?.confidence ?? "low";
}

/** Fetch any core domain the Investigator chose not to call, so the UI and score always cover all five. */
async function ensureCoverage(
  input: AgenticInput,
  captured: Captured,
  started: Set<DomainKey>,
  emit: Emit,
): Promise<void> {
  const { address, profile, weights, listing } = input;
  const fetchers: Record<DomainKey, () => Promise<void>> = {
    risques: async () => {
      captured.risques = await execTool(
        risksTool.execute!(
          { lat: address.lat, lon: address.lon, citycode: address.citycode },
          directToolContext,
        ),
      );
    },
    prix: async () => {
      captured.prix = await execTool(
        pricesTool.execute!(
          {
            lat: address.lat,
            lon: address.lon,
            citycode: address.citycode,
            propertyType: profile.propertyType,
          },
          directToolContext,
        ),
      );
    },
    air: async () => {
      captured.air = await execTool(
        airTool.execute!({ citycode: address.citycode }, directToolContext),
      );
    },
    securite: async () => {
      captured.securite = await execTool(
        crimeTool.execute!({ citycode: address.citycode }, directToolContext),
      );
    },
    energie: async () => {
      captured.energie = await execTool(
        energyTool.execute!(
          {
            lat: address.lat,
            lon: address.lon,
            housenumber: address.housenumber,
            street: address.street,
          },
          directToolContext,
        ),
      );
    },
  };

  for (const domain of CORE_DOMAINS) {
    const alreadyHave = {
      risques: captured.risques,
      prix: captured.prix,
      air: captured.air,
      securite: captured.securite,
      energie: captured.energie,
    }[domain];
    if (alreadyHave) continue;
    if (!started.has(domain)) await emit({ type: "tool-start", tool: domain });
    try {
      await fetchers[domain]();
      const section = sectionFor(domain, captured, weights, listing);
      if (section) await emit({ type: "section-ready", section });
    } catch {
      await emit({ type: "section-ready", section: unavailableSection(domain, weights[domain]) });
    }
  }
}

function evidenceForAssessor(captured: Captured, profile: UserProfile): string {
  const blocks = CORE_DOMAINS.map((domain) => {
    const result = {
      risques: captured.risques,
      prix: captured.prix,
      air: captured.air,
      securite: captured.securite,
      energie: captured.energie,
    }[domain];
    if (!result) return `## ${domain}\n(not investigated)`;
    return `## ${domain}\nstatus: ${result.status}, confidence: ${result.confidence}\ndata: ${JSON.stringify(result.data)}\nwarnings: ${JSON.stringify(result.warnings)}`;
  });
  return `Buyer profile: tags=[${profile.tags.join(", ") || "none"}], propertyType=${profile.propertyType}

Evidence gathered by the investigator:

${blocks.join("\n\n")}

Produce your structured assessment. Assign a verdict to every domain that has data. Ground every figure in the evidence above.`;
}

async function runAssessor(captured: Captured, profile: UserProfile): Promise<Assessment | null> {
  try {
    const result = await assessorAgent.generate(evidenceForAssessor(captured, profile), {
      structuredOutput: { schema: assessmentSchema },
    });
    return result.object ?? null;
  } catch {
    return null;
  }
}

function findingsFromAssessment(assessment: Assessment, captured: Captured): CrossRuleFinding[] {
  return assessment.redFlags.map((f, i) => {
    const sources: SourceRef[] = [];
    const seen = new Set<string>();
    let worst: ConfidenceLevel = "high";
    for (const domain of f.domains) {
      const src = sourceForDomain(domain, captured);
      if (src && !seen.has(src.url)) {
        seen.add(src.url);
        sources.push(src);
      }
      const conf = confidenceForDomain(domain, captured);
      if (CONFIDENCE_RANK[conf] < CONFIDENCE_RANK[worst]) worst = conf;
    }
    return {
      id: `${slug(f.title)}-${i}`,
      title: f.title,
      severity: f.severity,
      domains: f.domains,
      explanation: f.explanation,
      sources,
      confidence: worst,
    };
  });
}

/**
 * The genuinely agentic path (used when DEEPSEEK_API_KEY is set). The
 * Investigator agent calls the data tools itself, decides priorities from the
 * profile, and follows up on its own (flood exposure → flood-zone lookup). The
 * Assessor agent then forms its own verdicts, cross-domain red flags and buyer
 * actions from the gathered evidence. Numbers stay grounded: sections are built
 * from the real tool results, the map comes from real geometry, and the global
 * score is computed deterministically from the verdicts the agent assigned.
 *
 * Throws if the Investigator can't run at all (the caller then falls back to
 * the fully deterministic pipeline). Degrades internally if only the Assessor
 * fails — it keeps the grounded sections and runs the deterministic rule
 * engine for red flags.
 */
export async function runAgenticReport(input: AgenticInput, emit: Emit): Promise<Report> {
  const { address, profile, listing, weights } = input;
  const captured: Captured = {};
  const started = new Set<DomainKey>();
  let floodZones: AziZone[] = [];

  const prompt = `Investigate this property for a home buyer.

Address: ${address.label}
Coordinates: lat ${address.lat}, lon ${address.lon}
INSEE commune code (citycode): ${address.citycode}${address.housenumber ? `\nHouse number: ${address.housenumber}` : ""}${address.street ? `\nStreet: ${address.street}` : ""}
Property type: ${profile.propertyType}
Buyer profile tags: ${profile.tags.join(", ") || "none specified"}

Investigate all five core domains (risques, prix, air, securite, energie) and follow up on anything concerning.`;

  const stream = await investigatorAgent.stream(prompt, { maxSteps: 12 });

  for await (const chunk of stream.fullStream) {
    const c = chunk as { type: string; payload?: { toolName?: string; result?: unknown } };
    if (c.type === "tool-call") {
      const name = c.payload?.toolName;
      if (name === "floodZone") {
        await emit({
          type: "cascade",
          reasoning:
            "Flood exposure detected — the investigator is looking up the specific flood zone.",
          extraTools: [],
        });
      } else if (isDomain(name) && !started.has(name)) {
        started.add(name);
        await emit({ type: "tool-start", tool: name });
      }
    } else if (c.type === "tool-result") {
      const name = c.payload?.toolName;
      const result = c.payload?.result;
      if (name === "floodZone") {
        const zones = (result as ToolResult<{ zones: AziZone[] }> | undefined)?.data?.zones;
        if (Array.isArray(zones)) floodZones = zones;
      } else if (isDomain(name) && result) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (captured as Record<DomainKey, unknown>)[name] = result as any;
        const section = sectionFor(name, captured, weights, listing);
        if (section) await emit({ type: "section-ready", section });
      }
    }
  }

  if (floodZones.length > 0 && captured.risques?.data) {
    captured.risques = {
      ...captured.risques,
      data: { ...captured.risques.data, aziZones: floodZones },
    };
    const section = buildRisquesSection(captured.risques, weights.risques);
    await emit({ type: "section-ready", section });
  }

  await ensureCoverage(input, captured, started, emit);

  // The Assessor forms its own judgment. If it fails, fall back to the
  // deterministic rule engine for red flags and keep the grounded sections.
  const assessment = await runAssessor(captured, profile);

  const baseSections = new Map<DomainKey, DomainSection>();
  for (const domain of CORE_DOMAINS) {
    baseSections.set(
      domain,
      sectionFor(domain, captured, weights, listing) ?? unavailableSection(domain, weights[domain]),
    );
  }

  if (assessment) {
    for (const as of assessment.sections) {
      const base = baseSections.get(as.domain);
      if (base && base.verdict !== "indisponible") {
        baseSections.set(as.domain, {
          ...base,
          verdict: as.verdict,
          summary: as.summary,
          detail: as.detail,
        });
      }
    }
  }

  const sections = CORE_DOMAINS.map((d) => baseSections.get(d)!);

  // Re-emit the agent-authored sections so the UI upgrades from the grounded
  // deterministic text to the assessor's richer interpretation.
  if (assessment) {
    for (const section of sections) {
      await emit({ type: "section-ready", section });
    }
  }

  const redFlags = assessment
    ? findingsFromAssessment(assessment, captured)
    : analyzeCrossRules({
        risks: captured.risques ?? emptyResult(),
        prices: captured.prix ?? emptyResult(),
        air: captured.air ?? emptyResult(),
        crime: captured.securite ?? emptyResult(),
        energy: captured.energie ?? emptyResult(),
        profile,
        listing,
      });

  for (const finding of redFlags) {
    await emit({ type: "redflag", finding });
  }

  const { score, explanation } = computeGlobalScore(sections, redFlags);
  const allResults: Array<ToolResult<unknown> | undefined> = [
    captured.risques,
    captured.prix,
    captured.air,
    captured.securite,
    captured.energie,
  ];
  const warnings = allResults.flatMap((r) => r?.warnings ?? []);

  const report: Report = {
    address: {
      label: address.label,
      lat: address.lat,
      lon: address.lon,
      citycode: address.citycode,
    },
    generatedAt: new Date().toISOString(),
    globalScore: score,
    scoreExplanation: assessment?.scoreRationale?.trim() || explanation,
    redFlags,
    sections,
    actions: assessment?.actions ?? [],
    mapLayers: mapLayersFrom(captured.risques?.data ?? null, captured.prix?.data ?? null),
    warnings,
  };

  await emit({ type: "report-complete", report });
  return report;
}

function emptyResult<T>(): ToolResult<T> {
  return {
    status: "unavailable",
    data: null,
    confidence: "low",
    source: { name: "unavailable", url: "", retrievedAt: new Date().toISOString() },
    warnings: [],
  };
}
