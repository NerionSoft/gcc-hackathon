/**
 * Connectors layer — one thin typed client per UK open-data source.
 *
 * Every connector returns the same normalized result shape and declares its
 * licence, so the risk-signal layer can always cite dataset + URL +
 * retrievedAt, and errors/no-data become explicit low-confidence results —
 * never silent exceptions.
 *
 * Forkability: a country pack is this folder. A France pack (DVF, Géorisques,
 * BAN…) would re-implement these clients against the same `ConnectorResult`
 * contract without touching the rest of the app.
 */

export interface ConnectorMeta {
  /** Stable id, also the cache namespace, e.g. "ea-flood". */
  id: string;
  name: string;
  /** Dataset identifier used in sourceRefs, e.g. "land-registry-price-paid". */
  dataset: string;
  /** Human-readable API root documented in the README. */
  endpoint: string;
  /** Licence the data is served under, e.g. "OGL v3.0". */
  licence: string;
  /** True when a (free) API key is needed for live queries. */
  requiresKey: boolean;
}

/** Why a source cannot answer, without faking anything. */
export type DataGapReason =
  /** Free API key not configured — see README to enable. */
  | "key_missing"
  /** No machine-readable open endpoint exists (e.g. bulk CSV only). */
  | "no_open_endpoint"
  /** The source does not cover the queried area. */
  | "unsupported_area";

interface ResultBase {
  /** Dataset identifier for sourceRef.dataset. */
  dataset: string;
  /** Exact URL queried (or that would have been queried). */
  url: string;
  /** ISO timestamp of retrieval (or of the attempt). */
  retrievedAt: string;
  licence: string;
  /** True when served from the deterministic on-disk cache. */
  fromCache: boolean;
}

export interface ConnectorOk<T> extends ResultBase {
  status: "ok";
  records: T[];
}

/** The source answered but holds nothing for this query — a real finding. */
export interface ConnectorNoData extends ResultBase {
  status: "no_data";
  detail: string;
}

/** The source cannot be queried; the reason is explicit and typed. */
export interface ConnectorDataGap extends ResultBase {
  status: "data_gap";
  reason: DataGapReason;
  detail: string;
}

/** Network/HTTP/parse failure, normalized — callers emit low confidence. */
export interface ConnectorError extends ResultBase {
  status: "error";
  error: string;
  httpStatus?: number;
}

export type ConnectorResult<T> =
  | ConnectorOk<T>
  | ConnectorNoData
  | ConnectorDataGap
  | ConnectorError;

export function okResult<T>(
  base: Omit<ResultBase, "retrievedAt">,
  records: T[],
): ConnectorOk<T> | ConnectorNoData {
  if (records.length === 0) {
    return {
      ...base,
      status: "no_data",
      retrievedAt: new Date().toISOString(),
      detail: "The source answered but holds no records for this query.",
    };
  }
  return { ...base, status: "ok", retrievedAt: new Date().toISOString(), records };
}

export function dataGapResult(
  meta: ConnectorMeta,
  reason: DataGapReason,
  detail: string,
  url = meta.endpoint,
): ConnectorDataGap {
  return {
    status: "data_gap",
    dataset: meta.dataset,
    url,
    retrievedAt: new Date().toISOString(),
    licence: meta.licence,
    fromCache: false,
    reason,
    detail,
  };
}
