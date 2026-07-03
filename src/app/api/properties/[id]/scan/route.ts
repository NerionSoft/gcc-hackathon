import { NextResponse } from "next/server";
import { apiHandler } from "@/infrastructure/http/api-handler";
import { getProperty } from "@/db/access/properties";

/**
 * "Run fresh scan" stub (F0). The engine worker (phases 2-3) replaces this
 * handler with one that actually dispatches the 6 investigators; the response
 * contract (`scanRequestResponseSchema`) stays the same so the UI is untouched.
 */
export const POST = apiHandler(async (_req, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id || !getProperty(id)) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `Property not found: ${id ?? "?"}` } },
      { status: 404 },
    );
  }
  return NextResponse.json(
    {
      accepted: false,
      propertyId: id,
      message:
        "Scan engine not wired yet — the investigation workflow lands with the engine phases. Stored signals shown are from the seeded scan.",
    },
    { status: 202 },
  );
});
