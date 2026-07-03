import { LRUCache } from "lru-cache";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const memoryCache = new LRUCache<string, { value: unknown }>({ max: 2000 });

interface DiskEnvelope<T> {
  cachedAt: number;
  ttlMs: number;
  value: T;
}

function cacheDir(): string {
  return process.env.DATA_CACHE_DIR ?? "data/cache";
}

function diskPath(key: string): string {
  const hash = createHash("sha1").update(key).digest("hex");
  return path.join(cacheDir(), `${hash}.json`);
}

async function readDisk<T>(key: string): Promise<DiskEnvelope<T> | null> {
  try {
    const raw = await readFile(diskPath(key), "utf-8");
    return JSON.parse(raw) as DiskEnvelope<T>;
  } catch {
    return null;
  }
}

async function writeDisk<T>(key: string, envelope: DiskEnvelope<T>): Promise<void> {
  try {
    await mkdir(cacheDir(), { recursive: true });
    await writeFile(diskPath(key), JSON.stringify(envelope), "utf-8");
  } catch {
    // Best-effort: an unwritable cache dir must never break a report.
  }
}

export interface CacheOptions {
  /** How long a fresh value stays valid, in milliseconds. */
  ttlMs: number;
  /** Persist to data/cache/ so slow-changing sources (risks, DVF, crime, energy) survive process restarts. Never set for fast-changing data (air). */
  disk?: boolean;
}

/**
 * Memoize an async lookup by key. Checks the in-memory LRU first (fast path,
 * per-process), then the on-disk JSON cache when `disk` is set, and only
 * calls `fn` on a full miss. Errors from `fn` are never cached.
 */
export async function withCache<T>(
  key: string,
  opts: CacheOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const cached = memoryCache.get(key);
  if (cached !== undefined) return cached.value as T;

  if (opts.disk) {
    const onDisk = await readDisk<T>(key);
    if (onDisk && Date.now() - onDisk.cachedAt < onDisk.ttlMs) {
      memoryCache.set(key, { value: onDisk.value }, { ttl: opts.ttlMs });
      return onDisk.value;
    }
  }

  const value = await fn();
  memoryCache.set(key, { value }, { ttl: opts.ttlMs });
  if (opts.disk) {
    await writeDisk(key, { cachedAt: Date.now(), ttlMs: opts.ttlMs, value });
  }
  return value;
}
