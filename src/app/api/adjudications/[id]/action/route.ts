import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/infrastructure/http/api-handler";
import { applyHumanAdjudication } from "@/mastra/engine/adjudication";
import { resumeHumanAdjudication, suspendedStepsSafe } from "@/mastra/engine/campaign";
import { DomainError } from "@/shared/errors/domain-error";

const bodySchema = z.object({
  /** No auto-resolution of red exists — these are the ONLY expert actions. */
  action: z.enum(["confirm_risk", "request_more_evidence", "mark_resolved"]),
  comments: z.string().max(4000).optional(),
});

/**
 * F4 — expert decision on a case. When the campaign is suspended at the
 * awaitHumanAdjudication gate, the decision resumes the workflow; while it
 * is still monitoring evidence, the decision applies through the same
 * engine function directly (identical rules + audit trail either way).
 */
export const POST = apiHandler(async (req, context) => {
  const params = await context?.params;
  const adjudicationId = params?.id;
  if (!adjudicationId) throw new DomainError("VALIDATION_ERROR", "Missing adjudication id");
  const { action, comments } = bodySchema.parse(await req.json());

  const gates = await suspendedStepsSafe();
  if (gates.includes("await-human-adjudication")) {
    const status = await resumeHumanAdjudication({ adjudicationId, action, comments });
    return NextResponse.json({ adjudicationId, action, via: "workflow_resume", campaign: status });
  }
  const adjudication = applyHumanAdjudication(adjudicationId, action, comments ?? "");
  return NextResponse.json({ adjudicationId, action, via: "engine", adjudication });
});
