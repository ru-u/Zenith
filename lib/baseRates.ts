// Feature bucketing for the historical "closed lower next day" base rates (Phase 2).
// The thresholds here are mirrored in scripts/historical-base-rates.mjs — keep the
// two in sync (the script can't import this TS module under bare `node`).

export type CapBand = "nano" | "micro" | "small" | "mid";
export type RelvolBand = "rv_lt5" | "rv_5_20" | "rv_20_100" | "rv_100plus";

const MIN_N = 30; // below this, fall back to a coarser bucket

const RELVOL_LABEL: Record<RelvolBand, string> = {
  rv_lt5: "relvol <5",
  rv_5_20: "relvol 5–20",
  rv_20_100: "relvol 20–100",
  rv_100plus: "relvol 100+",
};

export function capBand(marketCap: number | null | undefined): CapBand | null {
  if (marketCap == null || !Number.isFinite(marketCap)) return null;
  if (marketCap < 50e6) return "nano";
  if (marketCap < 300e6) return "micro";
  if (marketCap < 2e9) return "small";
  return "mid";
}

export function relvolBand(relvol: number | null | undefined): RelvolBand | null {
  if (relvol == null || !Number.isFinite(relvol)) return null;
  if (relvol < 5) return "rv_lt5";
  if (relvol < 20) return "rv_5_20";
  if (relvol < 100) return "rv_20_100";
  return "rv_100plus";
}

export type BaseRate = {
  cap_band: string;
  relvol_band: string;
  n: number;
  down_rate: number; // 0..1
  median_next_day_return: number | null;
};

/**
 * Resolve the best base-rate bucket for a live ticker: (cap, relvol) if it exists
 * with n≥MIN_N, else cap-only, else the global ('ALL','ALL') row.
 */
export function resolveBaseRate(
  rows: BaseRate[],
  marketCap: number | null | undefined,
  relvol: number | null | undefined,
): BaseRate | null {
  const map = new Map(rows.map((r) => [`${r.cap_band}|${r.relvol_band}`, r]));
  const cap = capBand(marketCap);
  const rv = relvolBand(relvol);

  const keys: string[] = [];
  if (cap && rv) keys.push(`${cap}|${rv}`);
  if (cap) keys.push(`${cap}|ALL`);
  keys.push("ALL|ALL");

  for (const k of keys) {
    const r = map.get(k);
    if (r && r.n >= MIN_N) return r;
  }
  return map.get("ALL|ALL") ?? null;
}

/** A one-line empirical prior to drop into the thesis prompt. */
export function formatBaseRatePrior(r: BaseRate | null): string | null {
  if (!r) return null;
  const pct = Math.round(r.down_rate * 100);
  const scope =
    r.cap_band === "ALL"
      ? "all historical top-gainers"
      : r.relvol_band === "ALL"
        ? `${r.cap_band}-cap gainers`
        : `${r.cap_band}-cap, ${RELVOL_LABEL[r.relvol_band as RelvolBand] ?? r.relvol_band} gainers`;
  let medStr = "";
  if (r.median_next_day_return != null) {
    const m = r.median_next_day_return * 100;
    medStr = `, median next-day move ${m >= 0 ? "+" : ""}${m.toFixed(1)}%`;
  }
  return `Historical base rate (~1yr of ${scope}, n=${r.n}): closed LOWER the next session ${pct}% of the time${medStr}.`;
}
