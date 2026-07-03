import { z } from "zod";
import { fetchJson } from "@/connectors/http";
import { toConnectorError } from "@/connectors/base";
import { okResult, type ConnectorMeta, type ConnectorResult } from "@/connectors/types";

/**
 * planning.data.gov.uk — national planning & heritage datasets queryable by
 * point: conservation areas, listed buildings, article 4 directions, tree
 * preservation zones, flood risk zones, brownfield land…
 * No key required. Used for BUILDING permit/constraint signals and LAND
 * pollution context (brownfield).
 */

export const meta: ConnectorMeta = {
  id: "planning",
  name: "Planning Data Platform (MHCLG)",
  dataset: "planning-data",
  endpoint: "https://www.planning.data.gov.uk/entity.json",
  licence: "OGL v3.0",
  requiresKey: false,
};

/** Point-intersecting datasets that matter for CPI risk signals. */
export const DEFAULT_DATASETS = [
  "conservation-area",
  "listed-building-outline",
  "article-4-direction-area",
  "tree-preservation-zone",
  "flood-risk-zone",
  "brownfield-land",
  "brownfield-site",
] as const;

const rawEnvelopeSchema = z.object({
  entities: z.array(z.record(z.string(), z.unknown())),
});

export const planningEntitySchema = z.object({
  entity: z.number(),
  dataset: z.string(),
  name: z.string().nullable(),
  reference: z.string().nullable(),
  entryDate: z.string().nullable(),
  entityUrl: z.string(),
});
export type PlanningEntity = z.infer<typeof planningEntitySchema>;

export async function entitiesAtPoint(
  lat: number,
  lng: number,
  datasets: readonly string[] = DEFAULT_DATASETS,
): Promise<ConnectorResult<PlanningEntity>> {
  const datasetParams = datasets.map((d) => `dataset=${encodeURIComponent(d)}`).join("&");
  // exclude_field keeps the (large) polygon geometries out of the cache;
  // the entity URL still leads to the full record.
  const url = `${meta.endpoint}?latitude=${lat}&longitude=${lng}&${datasetParams}&limit=100&exclude_field=geometry,point`;
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
      error: "Unexpected planning.data.gov.uk response shape",
    };
  }

  const records: PlanningEntity[] = [];
  for (const raw of envelope.data.entities) {
    const entity = typeof raw["entity"] === "number" ? raw["entity"] : null;
    const dataset = typeof raw["dataset"] === "string" ? raw["dataset"] : null;
    if (entity === null || dataset === null) continue;
    records.push(
      planningEntitySchema.parse({
        entity,
        dataset,
        name: typeof raw["name"] === "string" && raw["name"] ? raw["name"] : null,
        reference:
          typeof raw["reference"] === "string" && raw["reference"] ? raw["reference"] : null,
        entryDate:
          typeof raw["entry-date"] === "string" && raw["entry-date"] ? raw["entry-date"] : null,
        entityUrl: `https://www.planning.data.gov.uk/entity/${entity}`,
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
