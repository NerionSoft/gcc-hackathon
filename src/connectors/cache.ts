import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

/**
 * Deterministic JSON file cache for connector responses.
 *
 * Cache-first: once `scripts/fetch-open-data.ts` has populated it, the demo
 * replays identical open-data responses offline. Entries live under
 * `data/cache/<sourceId>/<sha1(key)>.json` and are committed to the repo.
 */

const cacheEntrySchema = z.object({
  key: z.string(),
  url: z.string(),
  retrievedAt: z.string(),
  body: z.unknown(),
});
export type CacheEntry = z.infer<typeof cacheEntrySchema>;

const CACHE_ROOT = resolve(process.cwd(), "data", "cache");

function entryPath(sourceId: string, key: string): string {
  // Filename derivation only (collision resistance, not secrecy); the stored
  // entry's `key` field is verified on read.
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 24);
  return join(CACHE_ROOT, sourceId, `${hash}.json`);
}

export function readCache(sourceId: string, key: string): CacheEntry | undefined {
  const path = entryPath(sourceId, key);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = cacheEntrySchema.parse(JSON.parse(readFileSync(path, "utf8")));
    // Guard against hash collisions / stale layouts.
    return parsed.key === key ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writeCache(sourceId: string, key: string, url: string, body: unknown): CacheEntry {
  const entry: CacheEntry = { key, url, retrievedAt: new Date().toISOString(), body };
  const path = entryPath(sourceId, key);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
  return entry;
}
