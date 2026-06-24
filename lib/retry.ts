// Generic retry with exponential backoff + full jitter. Used by the market-data
// providers so a single transient block/timeout doesn't blank the screener.
//
// Full jitter (delay = random[0, exp]) over fixed backoff avoids synchronized
// retry storms when several requests fail at once — the AWS-recommended shape.

export interface RetryOptions {
  /** Total tries, including the first. Default 3. */
  attempts?: number;
  /** Backoff for the first retry, doubled each subsequent retry. Default 400ms. */
  baseMs?: number;
  /** Upper bound on a single backoff before jitter. Default 2000ms. */
  capMs?: number;
  /** Return false to stop retrying a non-transient error (e.g. a config error). */
  shouldRetry?: (err: unknown) => boolean;
  /** Side-channel for logging each retry. */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const {
    attempts = 3,
    baseMs = 400,
    capMs = 2000,
    shouldRetry = () => true,
    onRetry,
  } = opts;

  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isLast = i === attempts - 1;
      if (isLast || !shouldRetry(err)) break;
      const exp = Math.min(capMs, baseMs * 2 ** i);
      const delay = Math.random() * exp; // full jitter
      onRetry?.(err, i + 1, delay);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
