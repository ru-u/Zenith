// The landing's score tease. Tickers are shown openly; the SCORE is the gated
// element: free visitors see a blurred numeral behind a legible "/10", Pro
// users see the real short_score from ai_analyses (a DB read of already-stored
// rows — this feature never calls the Anthropic API).
//
// The blurred placeholder digits are deterministic (never Math.random — SSR,
// the DOM fan, and the WebGL fan must agree; random would also mismatch on
// hydration, and would visibly flip when the gainers query refetches).
//
// Integers only, matching the real score's domain (1-10; see winToScore in
// lib/quant/score.ts and the smallint check in supabase/schema.sql). Banded by
// rank: #1 always 10, #2-#4 land 6-9, and the last row lands 1-4 — a spread
// that says what the engine actually says, that a huge gainer is not
// automatically a good short. The blur is a CSS filter, so these digits are
// plain text in the DOM; they have to look like real output when read.

/**
 * FNV-1a plus an avalanche finalizer. The avalanche is load-bearing: the seeds
 * for adjacent ranks differ only in a trailing character, and a weaker hash
 * (e.g. h * 31 + charCode) would drop them into adjacent buckets — printing an
 * ascending run of 7 8 9 nearly every day.
 */
function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Digits only (no "/10" suffix) — what sits under the blur for free users. */
export function digitsFor(rank: number, dateKey: string): string {
  if (rank === 1) return "10";
  const h = hash(`${dateKey}:${rank}`);
  const base = rank >= 5 ? 1 : 6; // the tail row is the weak one
  return String(base + (h % 4));
}
