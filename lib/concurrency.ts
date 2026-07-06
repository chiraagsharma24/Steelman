import { AppError } from "@/lib/mesh";

const DEFAULT_BACKOFF_MS = 3000;

/** Runs `fn` over `items` with at most `limit` in flight at once. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Retries `fn` once, after a backoff, if it fails with a rate_limit_exceeded AppError. */
export async function withRateLimitBackoff<T>(fn: () => Promise<T>, logLabel = "pipeline"): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError && err.code === "rate_limit_exceeded") {
      const waitMs = (err.retryAfterSeconds ?? DEFAULT_BACKOFF_MS / 1000) * 1000;
      console.warn(`[${logLabel}] rate limited, backing off ${waitMs}ms then retrying once`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return await fn();
    }
    throw err;
  }
}
