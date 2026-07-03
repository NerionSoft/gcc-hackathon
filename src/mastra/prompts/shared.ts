/**
 * Shared prompt fragments for the investigator team (spec §4.1.A).
 * Versioned here, never inline in agent logic. English only.
 */

export const PROMPT_VERSION = "1.0.0";

/**
 * The evidence contract every investigator follows. The hard "no sourceRef →
 * rejected" rule is enforced in code (src/db/access/signals.ts); this prompt
 * exists so the model wastes no tokens producing findings that the gate
 * would reject anyway.
 */
export const EVIDENCE_DISCIPLINE = `
EVIDENCE DISCIPLINE (non-negotiable):
- Cite the exact record that justifies each finding: every signal MUST carry a
  sourceRef with the dataset id, the record identifier, the record URL and the
  retrievedAt timestamp, copied verbatim from the evidence you were given or
  from a tool result. Never invent, paraphrase or "reconstruct" a sourceRef.
- If a source is silent or ambiguous on a question, say so in the finding and
  assign LOW confidence (0.3 or below). A silent source is a data gap, not a
  green light and not a risk.
- NEVER assert a risk you cannot source. A finding without a supporting record
  will be rejected and logged as a failed extraction — do not emit it.
- Severity must follow the severity rubric of the signal definition you were
  given. Quote the fact from the record that meets the rubric threshold in
  your rationale.
- Risk is about the ASSET and its physical, legal, financial and environmental
  context — never about the people who live there. Do not use, mention or
  proxy demographic composition, origin, religion, or any protected
  characteristic of residents. Such findings are blocked by a fairness
  guardrail and audited.
- Output valid JSON only, matching the requested schema exactly. No markdown,
  no commentary outside the JSON.
`.trim();

export const INVESTIGATOR_OUTPUT_CONTRACT = `
OUTPUT: a JSON object { "signals": [...] }. Each signal:
{
  "signalCode": string,   // one of the signal definition codes you were given
  "finding": string,      // readable statement of what the record shows
  "sourceRef": { "dataset": string, "recordId": string, "url": string, "retrievedAt": string },
  "severity": "green" | "amber" | "red",
  "confidence": number,   // 0..1 — how well the record answers the question
  "rationale": string     // why this severity, citing the record
}
Emit one signal per signal definition when the evidence answers it (including
green "no risk found" findings — those are valuable). Skip a definition
entirely only when you have no sourceable record for it at all.
`.trim();
