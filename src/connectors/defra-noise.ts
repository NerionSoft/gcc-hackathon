import { z } from "zod";
import { fetchJson } from "@/connectors/http";
import { toConnectorError } from "@/connectors/base";
import { okResult, type ConnectorMeta, type ConnectorResult } from "@/connectors/types";

/**
 * Defra strategic noise mapping (Round 3) — road-traffic noise Lden bands.
 * Open WFS (GeoServer), no key. Used for the UNIT-NOISE signal.
 */

export const meta: ConnectorMeta = {
  id: "defra-noise",
  name: "Defra strategic noise mapping (road, Lden)",
  dataset: "defra-road-noise-lden-round-3",
  endpoint: "https://environment.data.gov.uk/spatialdata/road-noise-lden-england-round-3/wfs",
  licence: "OGL v3.0",
  requiresKey: false,
};

const TYPE_NAME = "dataset-f9970e51-7ff4-4a0c-a80c-08c9d0299116:Road_Noise_Lden_England_Round_3";

const rawEnvelopeSchema = z.object({
  features: z.array(
    z.object({
      id: z.string().optional(),
      properties: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
});

export const noiseBandSchema = z.object({
  featureId: z.string(),
  /** Lden band in dB, e.g. "55.0-59.9" or ">=75.0". */
  noiseClass: z.string(),
  recordUrl: z.string(),
});
export type NoiseBand = z.infer<typeof noiseBandSchema>;

/**
 * Road-noise Lden polygons intersecting a small box (~120m) around the point.
 * No records = the location is outside mapped >=55 dB road-noise bands.
 */
export async function noiseBandsAtPoint(
  lat: number,
  lng: number,
): Promise<ConnectorResult<NoiseBand>> {
  const d = 0.0006; // ≈ 60 m in latitude
  const bbox = `${lat - d},${lng - d},${lat + d},${lng + d},urn:ogc:def:crs:EPSG::4326`;
  // propertyName=noiseclass drops the (huge) polygon geometry from the
  // response — we only need the band, and the cache stays lightweight.
  const url =
    `${meta.endpoint}?service=WFS&version=2.0.0&request=GetFeature` +
    `&typeNames=${encodeURIComponent(TYPE_NAME)}&count=25&propertyName=noiseclass` +
    `&outputFormat=application/json&srsName=EPSG:4326&bbox=${bbox}`;
  const fetched = await fetchJson(url, { sourceId: meta.id, timeoutMs: 30_000 });
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
      error: "Unexpected Defra noise WFS response shape",
    };
  }

  const records: NoiseBand[] = [];
  for (const feature of envelope.data.features) {
    const noiseClass = feature.properties?.["noiseclass"];
    if (typeof noiseClass !== "string" || !noiseClass) continue;
    records.push(
      noiseBandSchema.parse({
        featureId: feature.id ?? "unknown",
        noiseClass,
        recordUrl: fetched.url,
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
