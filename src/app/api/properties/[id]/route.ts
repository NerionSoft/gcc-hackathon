import { NextResponse } from "next/server";
import { apiHandler } from "@/infrastructure/http/api-handler";
import { getDossier } from "@/app/api/_lib/read-models";

/** Read-only: full sourced dossier for one property (F0). */
export const GET = apiHandler(async (_req, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Missing property id" } },
      { status: 400 },
    );
  }
  const dossier = getDossier(id);
  if (!dossier) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `Property not found: ${id}` } },
      { status: 404 },
    );
  }
  return NextResponse.json(dossier);
});
