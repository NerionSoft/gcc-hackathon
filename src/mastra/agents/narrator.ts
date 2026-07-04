import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { domainKeySchema, type Report } from "@/types";

const polishSchema = z.object({
  scoreExplanation: z.string(),
  sections: z.array(z.object({ domain: domainKeySchema, summary: z.string(), detail: z.string() })),
  redFlags: z.array(z.object({ id: z.string(), explanation: z.string() })),
});
type PolishOutput = z.infer<typeof polishSchema>;

const narratorAgent = new Agent({
  id: "narrator",
  name: "Narrator",
  instructions: `You are an editor for a French property due-diligence report. You will receive
already-correct, factual report text produced by a deterministic system: domain summaries, details,
red-flag explanations, and a score explanation. Rewrite ONLY the prose so it reads more naturally in
English, in a calm, factual, non-alarmist tone suited to a citizen advisory tool.

STRICT RULES — you MUST follow these:
- Never change, add, or remove any number, percentage, date, currency amount, verdict word, or named
  entity (place names, source names, dataset names).
- Never introduce a fact that isn't already present in the input text.
- Keep each field's meaning and level of detail; only improve phrasing and flow.
- Keep each rewritten field roughly the same length as the original.
- Return exactly the same set of "domain"/"id" keys you were given, in the same order, each with a
  rewritten value.`,
  model: "deepseek/deepseek-chat",
});

const TIMEOUT_MS = 9000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

/**
 * Optional narrative-polish pass: rephrases the deterministic report's prose
 * for a more natural read. Never touches numbers/verdicts/sources — those
 * only ever come from the deterministic pipeline (composeReport). Silently
 * returns the report unchanged if no key is configured, or on any error or
 * timeout, so the report never depends on the LLM being available.
 */
export async function polishReport(report: Report): Promise<Report> {
  if (!process.env.DEEPSEEK_API_KEY) return report;

  const input: PolishOutput = {
    scoreExplanation: report.scoreExplanation,
    sections: report.sections.map((s) => ({
      domain: s.domain,
      summary: s.summary,
      detail: s.detail,
    })),
    redFlags: report.redFlags.map((f) => ({ id: f.id, explanation: f.explanation })),
  };

  try {
    const result = await withTimeout(
      narratorAgent.generate(JSON.stringify(input), { structuredOutput: { schema: polishSchema } }),
      TIMEOUT_MS,
      "Narrator agent timed out",
    );
    const polished = result.object;

    const sectionByDomain = new Map(polished.sections.map((s) => [s.domain, s]));
    const redFlagById = new Map(polished.redFlags.map((f) => [f.id, f]));

    return {
      ...report,
      scoreExplanation: polished.scoreExplanation || report.scoreExplanation,
      sections: report.sections.map((s) => {
        const p = sectionByDomain.get(s.domain);
        return p ? { ...s, summary: p.summary || s.summary, detail: p.detail || s.detail } : s;
      }),
      redFlags: report.redFlags.map((f) => {
        const p = redFlagById.get(f.id);
        return p ? { ...f, explanation: p.explanation || f.explanation } : f;
      }),
    };
  } catch {
    return report;
  }
}
