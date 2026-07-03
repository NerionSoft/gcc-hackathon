import { NextResponse } from "next/server";
import { apiHandler } from "@/infrastructure/http/api-handler";
import { getProperty } from "@/db/access/properties";
import { scanProperties } from "@/mastra/engine/scan";
import { isLlmConfigured } from "@/mastra/llm";
import { getLogger } from "@/infrastructure/logging/logger";

const logger = getLogger("api:property-scan");

/**
 * "Run fresh scan" (F0): dispatches the six investigators on this single
 * property — a portfolio of one, through the same `scanProperties` engine as
 * the campaign. Runs in the background; the UI polls the dossier. Response
 * contract unchanged (`scanRequestResponseSchema`).
 */
export const POST = apiHandler(async (_req, context) => {
  const params = await context?.params;
  const id = params?.id;
  const property = id ? getProperty(id) : undefined;
  if (!id || !property) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: `Property not found: ${id ?? "?"}` } },
      { status: 404 },
    );
  }

  if (property.status !== "unscanned") {
    return NextResponse.json(
      {
        accepted: false,
        propertyId: id,
        message: `Property already processed (status: ${property.status}); stored sourced signals are current.`,
      },
      { status: 202 },
    );
  }
  if (property.provenance === "real_open_data" && !isLlmConfigured()) {
    return NextResponse.json(
      {
        accepted: false,
        propertyId: id,
        message:
          "No LLM configured (OPENAI_API_KEY) — live investigation is disabled. See .env.example.",
      },
      { status: 202 },
    );
  }

  void scanProperties([id]).catch((error: unknown) =>
    logger.error("Single-property scan failed", {
      propertyId: id,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  return NextResponse.json(
    {
      accepted: true,
      propertyId: id,
      message:
        "Six investigators dispatched on live open data; poll the dossier for sourced signals.",
    },
    { status: 202 },
  );
});
