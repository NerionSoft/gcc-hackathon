/**
 * Anti-redlining fairness guardrail (spec §1, §4.1.C — HARD-CODED, not
 * prompted). Risk is measured on the asset and its physical/legal/financial/
 * environmental context, NEVER on protected characteristics of the people
 * who live there. Any signal derived from a protected-characteristic proxy
 * is blocked before it can enter a verdict, and the case is marked
 * `fairness_guardrail_triggered`.
 *
 * Detection is deliberately conservative: it scans the model-authored text
 * fields (finding, rationale) and the signal code for references to the UK
 * Equality Act 2010 protected characteristics and their common data proxies.
 * False positives cost a wasted signal; false negatives cost redlining.
 */

export interface FairnessCheck {
  blocked: boolean;
  /** The matched proxy terms, for the audit trail. */
  matches: string[];
}

const PROTECTED_PROXY_PATTERNS: readonly { label: string; re: RegExp }[] = [
  { label: "race/ethnicity", re: /\b(rac(e|ial)|ethnic\w*|skin colou?r)\b/i },
  {
    label: "national origin/migration",
    re: /\b(immigrant\w*|migrant\w*|asylum|refugee\w*|foreign[- ]born|nationalit\w+)\b/i,
  },
  {
    label: "religion",
    re: /\b(religio\w+|muslim\w*|islam\w*|jewish|christian\w*|hindu\w*|sikh\w*|mosque\w*|synagogue\w*|church-?going)\b/i,
  },
  {
    label: "age of residents",
    re: /\b(elderly (population|residents)|age profile of (the )?residents)\b/i,
  },
  { label: "disability", re: /\b(disabled (population|residents)|disabilit\w+ rate)\b/i },
  { label: "sex/gender", re: /\b(gender (mix|composition)|sex ratio)\b/i },
  {
    label: "sexual orientation",
    re: /\b(sexual orientation|lgbt\w*|gay (population|area|district))\b/i,
  },
  { label: "pregnancy/family status", re: /\b(single mothers?|pregnan\w+ rate)\b/i },
  {
    label: "demographic composition",
    re: /\b(demographic\w*|population (mix|composition|profile)|community composition)\b/i,
  },
];

/** Scan the free-text fields of a candidate signal for protected proxies. */
export function checkFairness(candidate: {
  signalCode?: string;
  finding?: string;
  rationale?: string;
}): FairnessCheck {
  const text = [candidate.signalCode, candidate.finding, candidate.rationale]
    .filter(Boolean)
    .join("\n");
  const matches = PROTECTED_PROXY_PATTERNS.filter(({ re }) => re.test(text)).map(
    ({ label }) => label,
  );
  return { blocked: matches.length > 0, matches };
}
