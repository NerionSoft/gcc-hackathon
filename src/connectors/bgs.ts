import { z } from "zod";
import { fetchJson } from "@/connectors/http";
import { toConnectorError } from "@/connectors/base";
import {
  dataGapResult,
  okResult,
  type ConnectorMeta,
  type ConnectorResult,
} from "@/connectors/types";

/**
 * British Geological Survey — LAND ground/soil signals.
 *
 * Open layer: the Radon Indicative Atlas (1 km grid) via the BGS GeoIndex
 * ArcGIS identify endpoint. The GeoSure shrink–swell / ground-stability
 * dataset has NO open query endpoint (licensed product), so that facet
 * returns an explicit, typed data gap — we never guess ground hazards.
 */

export const meta: ConnectorMeta = {
  id: "bgs",
  name: "British Geological Survey (GeoIndex)",
  dataset: "bgs-radon-indicative-atlas",
  endpoint: "https://map.bgs.ac.uk/arcgis/rest/services/GeoIndex_Onshore/radon/MapServer",
  licence: "Contains British Geological Survey materials © UKRI (open GeoIndex viewing service)",
  requiresKey: false,
};

const rawEnvelopeSchema = z.object({
  results: z
    .array(
      z.object({
        layerName: z.string().optional(),
        attributes: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
});

export const radonRecordSchema = z.object({
  /** OS 1km grid tile, e.g. "TQ3104". */
  tile: z.string(),
  /** Max radon potential class 1 (lowest) – 6 (highest). */
  classMax: z.number(),
  description: z.string(),
  recordUrl: z.string(),
});
export type RadonRecord = z.infer<typeof radonRecordSchema>;

export async function radonPotentialAtPoint(
  lat: number,
  lng: number,
): Promise<ConnectorResult<RadonRecord>> {
  const d = 0.01;
  const url =
    `${meta.endpoint}/identify?geometry=${lng},${lat}&geometryType=esriGeometryPoint&sr=4326` +
    `&layers=all&tolerance=1&mapExtent=${lng - d},${lat - d},${lng + d},${lat + d}` +
    `&imageDisplay=400,400,96&returnGeometry=false&f=json`;
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
      error: "Unexpected BGS identify response shape",
    };
  }

  const records: RadonRecord[] = [];
  for (const result of envelope.data.results ?? []) {
    const attrs = result.attributes ?? {};
    const tile = typeof attrs["TILE"] === "string" ? attrs["TILE"] : null;
    const classMax = Number.parseInt(String(attrs["CLASS_MAX"] ?? ""), 10);
    const description = typeof attrs["Description"] === "string" ? attrs["Description"] : null;
    if (!tile || !Number.isFinite(classMax) || !description) continue;
    records.push(radonRecordSchema.parse({ tile, classMax, description, recordUrl: url }));
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

/**
 * GeoSure shrink–swell / ground stability: no open query endpoint exists.
 * Explicit data gap by design — never fabricate ground-stability findings.
 */
export function groundStabilityAtPoint(): ConnectorResult<never> {
  return dataGapResult(
    meta,
    "no_open_endpoint",
    "BGS GeoSure (shrink–swell, landslides, ground stability) is a licensed dataset with no open query API. Reported as a data gap; consider ordering GeoSure or using local-authority SFRA documents.",
  );
}
