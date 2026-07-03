import { NextResponse } from "next/server";
import { apiHandler } from "@/infrastructure/http/api-handler";
import { listAdjudications } from "@/db/access/adjudications";

/** F4 — the adjudication war room table. */
export const GET = apiHandler(async () => {
  return NextResponse.json({ adjudications: listAdjudications() });
});
