import { NextRequest } from "next/server";
import { reportWorkflow } from "@/mastra/workflows/report-workflow";
import { parseReportQuery, type ReportQueryInput } from "@/mastra/workflows/parse-report-query";
import { buildDemoEvents, type DemoScenarioId } from "@/lib/demo-fixtures";
import type { ReportStreamEvent } from "@/types";

export const runtime = "nodejs";

function ndjson(event: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDemoScenario(searchParams: URLSearchParams): DemoScenarioId | null {
  const demo = searchParams.get("demo");
  return demo === "urban" || demo === "rural" ? demo : null;
}

/**
 * Approximates the pacing of the real workflow (see report-workflow.ts):
 * security/energy resolve fast, air a bit slower, risks and prices slowest —
 * so the demo's progressive reveal feels like a live run instead of an
 * instant dump.
 */
function delayForEvent(event: ReportStreamEvent, sectionIndex: number): number {
  switch (event.type) {
    case "plan":
      return 50;
    case "tool-start":
      return 20;
    case "section-ready":
      return sectionIndex < 5 ? 300 + sectionIndex * 150 : 250;
    case "cascade":
      return 200;
    case "redflag":
      return 150;
    case "report-complete":
      return 300;
    case "error":
      return 0;
  }
}

/** Streams a demo scenario's pre-authored events verbatim, with artificial delays for a believable progressive reveal. */
async function streamDemoEvents(
  controller: ReadableStreamDefaultController<Uint8Array>,
  scenarioId: DemoScenarioId,
) {
  const events = buildDemoEvents(scenarioId, new Date());
  let sectionIndex = 0;
  for (const event of events) {
    const delay = delayForEvent(event, sectionIndex);
    if (event.type === "section-ready") sectionIndex += 1;
    await sleep(delay);
    controller.enqueue(ndjson(event));
  }
}

/**
 * Streams the report workflow's progress as NDJSON — one ReportStreamEvent
 * per line — so the report screen renders each domain section the moment
 * its collector resolves instead of waiting for the whole report.
 *
 * `?demo=urban` or `?demo=rural` bypasses the real workflow entirely and
 * replays a hand-authored fixture instead — used for presentations that
 * must not depend on live government APIs or network availability.
 */
export async function GET(request: NextRequest) {
  let input: ReportQueryInput;
  try {
    input = parseReportQuery(request.nextUrl.searchParams);
  } catch {
    return new Response(JSON.stringify({ type: "error", message: "Invalid request parameters." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const demoScenario = parseDemoScenario(request.nextUrl.searchParams);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (demoScenario) {
          await streamDemoEvents(controller, demoScenario);
          return;
        }
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
              message: "The report could not be generated for this address.",
            }),
          );
        }
      } catch (err) {
        controller.enqueue(
          ndjson({
            type: "error",
            message: err instanceof Error ? err.message : "Unexpected error.",
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
