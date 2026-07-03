import { NextRequest } from "next/server";
import { reportWorkflow } from "@/mastra/workflows/report-workflow";
import { parseReportQuery, type ReportQueryInput } from "@/mastra/workflows/parse-report-query";

export const runtime = "nodejs";

function ndjson(event: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

/**
 * Streams the report workflow's progress as NDJSON — one ReportStreamEvent
 * per line — so the report screen renders each domain section the moment
 * its collector resolves instead of waiting for the whole report.
 */
export async function GET(request: NextRequest) {
  let input: ReportQueryInput;
  try {
    input = parseReportQuery(request.nextUrl.searchParams);
  } catch {
    return new Response(
      JSON.stringify({ type: "error", message: "Paramètres de requête invalides." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const run = await reportWorkflow.createRun();
        const output = run.stream({ inputData: input });
        for await (const chunk of output.fullStream) {
          const c = chunk as { type: string; data?: unknown };
          if (c.type === "data-report-event") {
            controller.enqueue(ndjson(c.data));
          }
        }
        const result = await output.result;
        if (result.status !== "success") {
          controller.enqueue(
            ndjson({
              type: "error",
              message: "Le rapport n'a pas pu être généré pour cette adresse.",
            }),
          );
        }
      } catch (err) {
        controller.enqueue(
          ndjson({
            type: "error",
            message: err instanceof Error ? err.message : "Erreur inattendue.",
          }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
