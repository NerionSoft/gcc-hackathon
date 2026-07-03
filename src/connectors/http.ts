import { getLogger } from "@/infrastructure/logging/logger";
import { readCache, writeCache } from "@/connectors/cache";

const logger = getLogger("connectors:http");

/**
 * Shared fetch wrapper for all connectors:
 * - cache-first (deterministic, offline-replayable demo);
 * - per-host minimum interval, so we respect the public rate limits of
 *   free services (police.uk, data.gov.uk…);
 * - timeout-guarded; failures come back as values, never exceptions.
 */

const lastRequestAt = new Map<string, number>();
const DEFAULT_MIN_INTERVAL_MS = 350;
const DEFAULT_TIMEOUT_MS = 20_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function throttle(host: string, minIntervalMs: number): Promise<void> {
  const last = lastRequestAt.get(host) ?? 0;
  const waitMs = last + minIntervalMs - Date.now();
  if (waitMs > 0) await sleep(waitMs);
  lastRequestAt.set(host, Date.now());
}

export interface FetchJsonOptions {
  /** Cache namespace — the connector id. */
  sourceId: string;
  /** Cache key; defaults to the URL. Include auth-independent parts only. */
  cacheKey?: string;
  headers?: Record<string, string>;
  minIntervalMs?: number;
  timeoutMs?: number;
  /** Skip the cache read (still writes). Used by the fetch pipeline to refresh. */
  bypassCache?: boolean;
}

export type FetchJsonResult =
  | { ok: true; body: unknown; url: string; retrievedAt: string; fromCache: boolean }
  | { ok: false; error: string; url: string; retrievedAt: string; httpStatus?: number };

export async function fetchJson(url: string, options: FetchJsonOptions): Promise<FetchJsonResult> {
  const cacheKey = options.cacheKey ?? url;

  if (!options.bypassCache) {
    const cached = readCache(options.sourceId, cacheKey);
    if (cached) {
      return {
        ok: true,
        body: cached.body,
        url: cached.url,
        retrievedAt: cached.retrievedAt,
        fromCache: true,
      };
    }
  }

  const host = new URL(url).host;
  await throttle(host, options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS);

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", ...options.headers },
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.warn("Connector HTTP error", { url, status: response.status });
      return {
        ok: false,
        error: `HTTP ${response.status} ${response.statusText}`,
        url,
        retrievedAt: new Date().toISOString(),
        httpStatus: response.status,
      };
    }

    const body: unknown = await response.json();
    const entry = writeCache(options.sourceId, cacheKey, url, body);
    return { ok: true, body, url, retrievedAt: entry.retrievedAt, fromCache: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("Connector fetch failed", { url, error: message });
    return { ok: false, error: message, url, retrievedAt: new Date().toISOString() };
  }
}
