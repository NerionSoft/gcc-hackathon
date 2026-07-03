export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface FetchJsonOptions {
  timeoutMs?: number;
  retries?: number;
  retryBaseDelayMs?: number;
  headers?: Record<string, string>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelayMs(attempt: number, baseMs: number, retryAfterHeader: string | null): number {
  const retryAfterS = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  if (Number.isFinite(retryAfterS)) return retryAfterS * 1000;
  const exponential = baseMs * 2 ** attempt;
  const jitter = Math.random() * baseMs;
  return exponential + jitter;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Fetch + parse JSON with a hard timeout and exponential backoff (honouring
 * `Retry-After` when present) on 429/5xx and network aborts. Every collector
 * tool goes through this — no source calls `fetch` directly.
 */
export async function fetchJson<T>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
  const { timeoutMs = 8000, retries = 2, retryBaseDelayMs = 300, headers } = opts;

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal, headers });
      if (!res.ok) {
        if (isRetryableStatus(res.status) && attempt < retries) {
          await sleep(backoffDelayMs(attempt, retryBaseDelayMs, res.headers.get("retry-after")));
          continue;
        }
        throw new HttpError(`${url} responded ${res.status}`, res.status);
      }
      return (await res.json()) as T;
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      const isHttpRetryable =
        err instanceof HttpError && err.status !== undefined && isRetryableStatus(err.status);
      if ((isAbort || isHttpRetryable) && attempt < retries) {
        await sleep(backoffDelayMs(attempt, retryBaseDelayMs, null));
        continue;
      }
      if (isAbort) throw new HttpError(`${url} timed out after ${timeoutMs}ms`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
