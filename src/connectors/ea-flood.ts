import { z } from "zod";
import { fetchJson } from "@/connectors/http";
import { toConnectorError } from "@/connectors/base";
import { okResult, type ConnectorMeta, type ConnectorResult } from "@/connectors/types";

/**
 * Environment Agency real-time flood-monitoring API — flood alert/warning
 * areas around a point, plus any current flood warnings. No key required.
 * Used for the LAND-FLOOD signal.
 *
 * Note: EA "Flood Map for Planning" zones 2/3 are served via a separate
 * spatial-data service; the flood ALERT AREAS here are the open, queryable
 * proxy for flood exposure, and current warnings capture live risk.
 */

export const meta: ConnectorMeta = {
  id: "ea-flood",
  name: "Environment Agency flood monitoring",
  dataset: "ea-flood-monitoring",
  endpoint: "https://environment.data.gov.uk/flood-monitoring",
  licence: "OGL v3.0",
  requiresKey: false,
};

const rawEnvelopeSchema = z.object({
  items: z.array(z.record(z.string(), z.unknown())),
});

export const floodAreaSchema = z.object({
  notation: z.string(),
  label: z.string(),
  riverOrSea: z.string().nullable(),
  areaUrl: z.string(),
  kind: z.enum(["alert_area", "warning_area"]),
});
export type FloodArea = z.infer<typeof floodAreaSchema>;

export const currentFloodSchema = z.object({
  floodAreaId: z.string(),
  description: z.string(),
  severity: z.string(),
  severityLevel: z.number(),
  timeRaised: z.string().nullable(),
  recordUrl: z.string(),
});
export type CurrentFlood = z.infer<typeof currentFloodSchema>;

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Flood alert/warning areas within `distKm` of the point. */
export async function floodAreasNear(
  lat: number,
  lng: number,
  distKm = 3,
): Promise<ConnectorResult<FloodArea>> {
  const url = `${meta.endpoint}/id/floodAreas?lat=${lat}&long=${lng}&dist=${distKm}&_limit=50`;
  const fetched = await fetchJson(url, { sourceId: meta.id });
  if (!fetched.ok) return toConnectorError(meta, fetched);

  const envelope = rawEnvelopeSchema.safeParse(fetched.body);
  if (!envelope.success) {
    return {
      status: "error",
      dataset: meta.dataset,
      url: fetched.url,
      retrievedAt: fetched.retrievedAt,
      licence: meta.licence,
      fromCache: fetched.fromCache,
      error: "Unexpected flood-areas response shape",
    };
  }

  const records: FloodArea[] = [];
  for (const raw of envelope.data.items) {
    const notation = str(raw["notation"]);
    const label = str(raw["label"]);
    if (!notation || !label) continue;
    const about = str(raw["@id"]) ?? `${meta.endpoint}/id/floodAreas/${notation}`;
    records.push(
      floodAreaSchema.parse({
        notation,
        label,
        riverOrSea: str(raw["riverOrSea"]),
        areaUrl: about,
        // EA convention: FWF/FWD codes = warning areas, WAF = alert areas.
        kind: notation.startsWith("06") || notation.includes("FW") ? "warning_area" : "alert_area",
      }),
    );
  }

  return okResult(
    {
      dataset: meta.dataset,
      url: fetched.url,
      licence: meta.licence,
      fromCache: fetched.fromCache,
    },
    records,
  );
}

/** Live flood warnings/alerts in force within `distKm` of the point. */
export async function currentFloodsNear(
  lat: number,
  lng: number,
  distKm = 5,
): Promise<ConnectorResult<CurrentFlood>> {
  const url = `${meta.endpoint}/id/floods?lat=${lat}&long=${lng}&dist=${distKm}`;
  const fetched = await fetchJson(url, { sourceId: meta.id });
  if (!fetched.ok) return toConnectorError(meta, fetched);

  const envelope = rawEnvelopeSchema.safeParse(fetched.body);
  if (!envelope.success) {
    return {
      status: "error",
      dataset: meta.dataset,
      url: fetched.url,
      retrievedAt: fetched.retrievedAt,
      licence: meta.licence,
      fromCache: fetched.fromCache,
      error: "Unexpected floods response shape",
    };
  }

  const records: CurrentFlood[] = [];
  for (const raw of envelope.data.items) {
    const severityLevel = typeof raw["severityLevel"] === "number" ? raw["severityLevel"] : null;
    const description = str(raw["description"]);
    if (severityLevel === null || !description) continue;
    const floodAreaId = str(raw["floodAreaID"]) ?? "unknown";
    records.push(
      currentFloodSchema.parse({
        floodAreaId,
        description,
        severity: str(raw["severity"]) ?? `severity level ${severityLevel}`,
        severityLevel,
        timeRaised: str(raw["timeRaised"]),
        recordUrl: str(raw["@id"]) ?? fetched.url,
      }),
    );
  }

  return okResult(
    {
      dataset: meta.dataset,
      url: fetched.url,
      licence: meta.licence,
      fromCache: fetched.fromCache,
    },
    records,
  );
}
