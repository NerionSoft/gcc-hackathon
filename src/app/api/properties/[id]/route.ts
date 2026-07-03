import { NextResponse } from "next/server";
import { apiHandler } from "@/infrastructure/http/api-handler";
import { listAdjudications } from "@/db/access/adjudications";
import { listAuditEvents } from "@/db/access/audit";
import { getProperty } from "@/db/access/properties";
import { listSignalsForProperty } from "@/db/access/signals";
import { DomainError } from "@/shared/errors/domain-error";

/** One property's full evidence view: signals, adjudication, audit trail. */
export const GET = apiHandler(async (_req, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) throw new DomainError("VALIDATION_ERROR", "Missing property id");
  const property = getProperty(id);
  if (!property) throw new DomainError("PROPERTY_NOT_FOUND", `Property not found: ${id}`);

  return NextResponse.json({
    property,
    signals: listSignalsForProperty(id),
    adjudication: listAdjudications().find((a) => a.propertyId === id) ?? null,
    auditEvents: listAuditEvents({ entityId: id, limit: 100 }),
  });
});
