// The landing's score tease. Tickers are shown openly; the SCORE is the gated
// element: free visitors see a blurred numeral behind a legible "/10", Pro
// users see the real short_score from ai_analyses (a DB read of already-stored
// rows — this feature never calls the Anthropic API).
//
// The blurred placeholder digits are deterministic (never Math.random — SSR,
// the DOM fan, and the WebGL fan must agree; random would also mismatch on
// hydration). Rank 1 always blurs "10": a two-glyph silhouette that hints at
// a perfect score without claiming one.

export function demoScore(rank: number, dateKey: string): number {
  if (rank === 1) return 10;
  const s = `${dateKey}:${rank}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  // 6.8–9.4, one decimal — high enough to intrigue, never a second 10.
  return Math.round((6.8 + (h % 27) / 10) * 10) / 10;
}

/** Digits only (no "/10" suffix) — what sits under the blur for free users. */
export function digitsFor(rank: number, dateKey: string): string {
  const score = demoScore(rank, dateKey);
  return score % 1 === 0 ? score.toFixed(0) : score.toFixed(1);
}

/** Format a real (or placeholder) score's digits for display. */
export function scoreDigits(score: number): string {
  return score % 1 === 0 ? score.toFixed(0) : score.toFixed(1);
}
