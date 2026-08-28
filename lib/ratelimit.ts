import { NextResponse } from "next/server";

// Sliding-window rate limiting for routes that cost money, send mail, or can be
// used to brute-force something.
//
// WHY IN-MEMORY AND NOT UPSTASH/REDIS: Zenith runs a SINGLE Railway replica by
// design — the in-process node-cron scheduler in instrumentation.ts requires it
// (see CLAUDE.md). One process means one counter, so a shared Redis buys
// nothing here except an extra network hop, a paid dependency, and a new
// failure mode on every request. The tradeoff is explicit: counters reset on
// deploy/restart, and the moment this app scales past one replica these limits
// become per-replica and must move to Upstash. `checkLimit` is the only thing
// the routes touch, so that swap is a one-file change.

type Bucket = { hits: number[] };

// Hard ceiling on tracked keys. An attacker rotating source IPs would otherwise
// grow this map without bound — the limiter itself becoming the memory leak it
// was added to prevent. At the cap we drop the coldest third rather than
// refusing traffic: rate limiting is a safety belt, not an availability gate.
const MAX_KEYS = 20_000;

const buckets = new Map<string, Bucket>();

function sweep(now: number) {
  if (buckets.size <= MAX_KEYS) return;
  // Coldest-first eviction by most recent hit.
  const byRecency = [...buckets.entries()].sort(
    (a, b) => (a[1].hits.at(-1) ?? 0) - (b[1].hits.at(-1) ?? 0),
  );
  for (let i = 0; i < Math.ceil(MAX_KEYS / 3); i++) {
    const entry = byRecency[i];
    if (entry) buckets.delete(entry[0]);
  }
  void now;
}

export type LimitResult = {
  success: boolean;
  remaining: number;
  /** Seconds until the window frees a slot — sent as Retry-After. */
  retryAfter: number;
};

/**
 * Record a hit against `key` and report whether it is within budget.
 * `windowSeconds` is a true sliding window (timestamp log), not a fixed bucket,
 * so a burst straddling a boundary can't get 2x the allowance.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): LimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const cutoff = now - windowMs;

  const bucket = buckets.get(key) ?? { hits: [] };
  // Drop expired hits. The log is append-only in time order, so the survivors
  // are always a suffix.
  const hits = bucket.hits.filter((t) => t > cutoff);

  if (hits.length >= limit) {
    bucket.hits = hits;
    buckets.set(key, bucket);
    const oldest = hits[0] ?? now;
    return {
      success: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }

  hits.push(now);
  bucket.hits = hits;
  buckets.set(key, bucket);
  sweep(now);

  return { success: true, remaining: limit - hits.length, retryAfter: 0 };
}

/**
 * Best-effort client IP.
 *
 * Order matters: `cf-connecting-ip` is written by Cloudflare (which fronts
 * zenithscreener.com) and cannot be forged by the client — a request arriving
 * with its own cf-connecting-ip header gets that header overwritten at the
 * edge. `x-forwarded-for` is client-appendable, so it is only a fallback, and
 * we take the FIRST entry knowing a determined attacker can rotate it. IP is
 * a spam-control signal, never an authorization one.
 */
export function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return (fwd.split(",")[0] ?? "").trim() || "unknown";
  return "unknown";
}

/**
 * Apply a limit and return a ready-made 429 when it trips, or null to continue.
 * Keyed by route + identity so one user's spam can't exhaust another's budget.
 */
export function checkLimit(
  req: Request,
  opts: { route: string; limit: number; windowSeconds: number; userId?: string },
): NextResponse | null {
  // Prefer the user id: it survives IP rotation and is the thing we actually
  // want to budget. Fall back to IP for unauthenticated routes.
  const identity = opts.userId ? `u:${opts.userId}` : `ip:${clientIp(req)}`;
  const result = rateLimit(`${opts.route}:${identity}`, opts.limit, opts.windowSeconds);
  if (result.success) return null;

  return NextResponse.json(
    { error: "rate_limited", retryAfter: result.retryAfter },
    {
      status: 429,
      headers: {
        "retry-after": String(result.retryAfter),
        "cache-control": "no-store",
      },
    },
  );
}

/** Test/ops hook — drops all counters. */
export function resetLimits() {
  buckets.clear();
}
