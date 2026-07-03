import { createElement, type ReactElement } from "react";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { reportWorkflow } from "@/mastra/workflows/report-workflow";
import { parseReportQuery } from "@/mastra/workflows/parse-report-query";
import { ReportPdf } from "@/components/pdf/report-pdf";
import { buildDemoReport, type DemoScenarioId } from "@/lib/demo-fixtures";
import type { Report } from "@/types";

export const runtime = "nodejs";

function parseDemoScenario(searchParams: URLSearchParams): DemoScenarioId | null {
  const demo = searchParams.get("demo");
  return demo === "urban" || demo === "rural" ? demo : null;
}

/**
 * Re-runs the (cached) report deterministically and renders it to PDF — no
 * streaming needed here. `?demo=urban`/`?demo=rural` skips the real workflow
 * and builds the PDF straight from the matching hand-authored fixture.
 */
export async function GET(request: NextRequest) {
  let input;
  try {
    input = parseReportQuery(request.nextUrl.searchParams);
  } catch {
    return NextResponse.json({ message: "Invalid request parameters." }, { status: 400 });
  }

  const demoScenario = parseDemoScenario(request.nextUrl.searchParams);

  let report: Report;
  if (demoScenario) {
    report = buildDemoReport(demoScenario, new Date());
  } else {
    const run = await reportWorkflow.createRun();
    const result = await run.start({ inputData: input });
    if (result.status !== "success") {
      return NextResponse.json(
        { message: "The report could not be generated for this address." },
        { status: 502 },
      );
    }
    report = result.result;
  }

  // ReportPdf is a component that renders <Document>, but @react-pdf/renderer's
  // types require the top-level element to literally be typed as a Document —
  // a known friction point when wrapping it in a helper component.
  const element = createElement(ReportPdf, {
    report,
  }) as unknown as ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);
  const filename = `terravista-${input.address.citycode}-${Date.now()}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
