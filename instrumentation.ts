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
  const SETTLE_MIN = 5; // wait for the closing auction before finalizing

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
      } else if (sinceClose != null && sinceClose >= SETTLE_MIN && sinceClose < 15) {
        await ping("/api/cron/run-eod");
      }
    },
    { timezone: "America/New_York" },
  );

  console.log("[scheduler] in-process pre-close + EOD scheduler armed (ET)");
}
