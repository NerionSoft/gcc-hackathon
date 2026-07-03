import type { FetchJsonResult } from "@/connectors/http";
import type { ConnectorError, ConnectorMeta } from "@/connectors/types";

/** Normalize a failed fetch into a ConnectorError result (never thrown). */
export function toConnectorError(
  meta: ConnectorMeta,
  fetchResult: Extract<FetchJsonResult, { ok: false }>,
): ConnectorError {
  return {
    status: "error",
    dataset: meta.dataset,
    url: fetchResult.url,
    retrievedAt: fetchResult.retrievedAt,
    licence: meta.licence,
    fromCache: false,
    error: fetchResult.error,
    httpStatus: fetchResult.httpStatus,
  };
}
