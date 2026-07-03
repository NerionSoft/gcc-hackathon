import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/infrastructure/http/api-handler";
import { resumeAssessmentReview } from "@/mastra/engine/campaign";
import { DomainError } from "@/shared/errors/domain-error";

const bodySchema = z.object({
  decision: z.enum(["approve", "request_changes"]),
  comments: z.string().max(4000).optional(),
  /** Mocked single-user demo — Nadia reviews everything. */
  reviewedBy: z.string().min(1).default("Nadia (Head of Due Diligence)"),
});

/**
 * F3 — the review gate. Approve → the workflow publishes the cluster
 * (hard-gated on reviewedAt). Request changes → back to draft, re-composed
 * with the comments. Both drive the suspended workflow's resume().
 */
export const POST = apiHandler(async (req, context) => {
  const params = await context?.params;
  const clusterId = params?.id;
  if (!clusterId) throw new DomainError("VALIDATION_ERROR", "Missing cluster id");
  const body = bodySchema.parse(await req.json());

  const status = await resumeAssessmentReview({ clusterId, ...body });
  return NextResponse.json({ clusterId, decision: body.decision, campaign: status });
});
