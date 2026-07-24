// Company-identity cross-check for external lookups keyed by bare ticker.
//
// A ticker is not a stable identifier: symbols get reused across companies,
// and SEC's ticker→CIK map can lag a listing-day ticker change (SPAC
// conversions rename the company AND the symbol — day-one "BIOT" may still map
// to the pre-merger shell, or to a prior holder of the symbol). Pulling
// filings for whichever company the stale map names would attribute someone
// else's catalysts to the gainer. Before trusting a lookup, compare the
// company name the source reports against the name the scanner reported; on a
// clear mismatch the caller should skip (a missing catalyst is recoverable, a
// wrong-company catalyst is misinformation).

// Legal-form / structural tokens that carry no identity signal. Sector words
// (PHARMACEUTICALS, TECHNOLOGIES…) are deliberately NOT dropped as noise —
// they stay as tokens but shouldn't match on their own, which the leading-token
// rule below handles.
const GENERIC_TOKENS = new Set([
  "INC",
  "INCORPORATED",
  "CORP",
  "CORPORATION",
  "CO",
  "COMPANY",
  "COMPANIES",
  "LTD",
  "LIMITED",
  "PLC",
  "LLC",
  "LP",
  "SA",
  "NV",
  "AG",
  "SE",
  "AB",
  "ASA",
  "HOLDING",
  "HOLDINGS",
  "GROUP",
  "THE",
  "CLASS",
  "ORDINARY",
  "SHARES",
  "COMMON",
  "STOCK",
  "ADR",
  "ADS",
]);

/** Uppercased identity-bearing tokens, generic legal noise removed. */
function distinctiveTokens(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((t) => t.length > 0 && !GENERIC_TOKENS.has(t));
}

/**
 * Do two company-name strings plausibly name the same company?
 *
 * Permissive by design where evidence is thin (either name empty after
 * normalization → true: don't kill catalysts because a source omitted the
 * name). Match when the leading distinctive token agrees ("NovoCure Limited"
 * vs "NOVOCURE LTD") or when at least half of the shorter name's tokens appear
 * in the longer ("US Steel" vs "United States Steel Corp"). A SPAC shell vs
 * its post-merger identity ("Relativity Acquisition Corp" vs "Instinct Bio
 * Technical Company Holdings") shares nothing and is rejected.
 */
export function namesLikelySameCompany(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const ta = distinctiveTokens(a);
  const tb = distinctiveTokens(b);
  if (ta.length === 0 || tb.length === 0) return true;
  if (ta[0] === tb[0]) return true;
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const pool = new Set(longer);
  const hits = shorter.filter((t) => pool.has(t)).length;
  return hits / shorter.length >= 0.5;
}
