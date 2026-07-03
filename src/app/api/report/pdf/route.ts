import { createElement, type ReactElement } from "react";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { reportWorkflow } from "@/mastra/workflows/report-workflow";
import { parseReportQuery } from "@/mastra/workflows/parse-report-query";
import { ReportPdf } from "@/components/pdf/report-pdf";

export const runtime = "nodejs";

/** Re-runs the (cached) report deterministically and renders it to PDF — no streaming needed here. */
export async function GET(request: NextRequest) {
  let input;
  try {
    input = parseReportQuery(request.nextUrl.searchParams);
  } catch {
    return NextResponse.json({ message: "Paramètres de requête invalides." }, { status: 400 });
  }

  const run = await reportWorkflow.createRun();
  const result = await run.start({ inputData: input });
  if (result.status !== "success") {
    return NextResponse.json(
      { message: "Le rapport n'a pas pu être généré pour cette adresse." },
      { status: 502 },
    );
  }

  // ReportPdf is a component that renders <Document>, but @react-pdf/renderer's
  // types require the top-level element to literally be typed as a Document —
  // a known friction point when wrapping it in a helper component.
  const element = createElement(ReportPdf, {
    report: result.result,
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
