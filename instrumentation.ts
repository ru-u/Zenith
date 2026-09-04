// In-process scheduler (Railway persistent container). Next runs `register()`
// once at server start; we guard to the Node.js runtime only. We schedule a
// single every-5-min check and, when within the pre-close window or just after
// the close, ping the secured cron endpoints — reusing all their fetch / persist
// / alert logic. The every-5-min check (vs a fixed clock time) auto-adapts to
// half-days via the early-close-aware market calendar.
//
// IMPORTANT: run a SINGLE replica so this fires once; the endpoints are
// idempotent (theses skip-existing, email deduped once/day) as a safety net. On
// serverless (no persistent process) this never runs — the read-path trigger +
// an external scheduler cover that case.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[scheduler] CRON_SECRET not set — in-process scheduler disabled");
    return;
  }

  const cron = (await import("node-cron")).default;
  const { isTradingDay, secondsUntilCloseET, minutesSinceCloseET } = await import(
    "@/lib/market-calendar"
  );

  const base = `http://127.0.0.1:${process.env.PORT ?? 3000}`;
  const PRECLOSE_WINDOW_MIN = 30; // generate theses + email within 30 min of close
  // Wait out BOTH the closing auction and the provider's feed delay before
  // finalizing. TradingView's scanner reports `update_mode:
  // "delayed_streaming_900"` — a 15-minute delay — so a snapshot taken at 4:05
  // records the ~3:50 price and calls it the close. On 2026-08-31 that stored
  // USDE at 9.015/+33.4% against a real close of 8.87/+31.2%, and knocked AEHL
  // (whose price-derived market cap straddled the $25M floor) off the board
  // entirely. DECA orders fill AT the close, so this number has to clear the
  // delay, not just the auction.
  const SETTLE_MIN = 20;

  async function ping(path: string) {
    try {
      const res = await fetch(`${base}${path}`, {
        headers: { authorization: `Bearer ${secret}` },
      });
      console.log(`[scheduler] ${path} -> ${res.status}`);
    } catch (e) {
      console.error(`[scheduler] ${path} failed:`, (e as Error)?.message);
    }
  }

  // Every 5 minutes, weekdays, in ET. Endpoints no-op on non-trading days and are
  // idempotent, so repeated ticks within a window are harmless.
  cron.schedule(
    "*/5 * * * 1-5",
    async () => {
      if (!isTradingDay()) return;
      const sClose = secondsUntilCloseET();
      const sinceClose = minutesSinceCloseET();
      if (sClose != null && sClose <= PRECLOSE_WINDOW_MIN * 60) {
        await ping("/api/cron/pre-close");
      } else if (
        sinceClose != null &&
        sinceClose >= SETTLE_MIN &&
        sinceClose < SETTLE_MIN + 10
      ) {
        await ping("/api/cron/run-eod");
      }
    },
    { timezone: "America/New_York" },
  );

  // Unconfirmed-account cleanup. Hourly, EVERY day — deliberately not the
  // weekday/trading-day gate above: people sign up on weekends, and an account
  // created Friday evening shouldn't outlive its 24h window until Monday.
  // Hourly rather than daily is what makes the window mean 24-25h instead of
  // 24-48h. The endpoint is idempotent and usually finds nothing.
  cron.schedule(
    "17 * * * *",
    async () => {
      await ping("/api/cron/prune-unconfirmed");
    },
    { timezone: "America/New_York" },
  );

  // Calibration drift. Monthly, 09:00 ET on the 1st — it reads accumulated
  // history, so the day is arbitrary; what matters is that it runs at all. The
  // endpoint is silent unless a scoring constant now sits outside its realized
  // confidence interval, which is the whole point: measure monthly, act only on
  // a flag, keep a human in the loop.
  cron.schedule(
    "0 9 1 * *",
    async () => {
      await ping("/api/cron/calibration");
    },
    { timezone: "America/New_York" },
  );

  console.log(
    "[scheduler] in-process pre-close + EOD (ET) + hourly unconfirmed-account prune " +
      "+ monthly calibration check armed",
  );
}
