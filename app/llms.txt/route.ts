import { siteUrl } from "@/lib/site";
import {
  LEGAL_CONTACT_EMAIL,
  NOT_ADVICE,
  NOT_AFFILIATED,
  ENGINE_UPDATED,
} from "@/lib/legal";
import { PRO_PRICE_MONTHLY } from "@/lib/pricing";
import { activeProseMode } from "@/lib/quant/thesis";

// /llms.txt — the emerging convention for telling a language model what a site
// is, in one fetch, without making it infer the answer from marketing copy.
//
// A route handler rather than a file in public/ so every fact is read from the
// place that already owns it: the URL from lib/site, the disclaimers from
// lib/legal, the price from lib/pricing, the prose mode from lib/quant/thesis.
// A static file would be one more copy of all of those, drifting quietly.
//
// The disclaimer lines are included verbatim and near the top ON PURPOSE. If an
// assistant is going to summarize Zenith to a 16-year-old, "not investment
// advice" and "not affiliated with DECA" should be in the part it reads first.
//
// force-dynamic for the same reason /engine is: it states the live prose mode
// rather than an intended one, so flipping AI_PROSE_MODE can't make this lie.
export const dynamic = "force-dynamic";

export async function GET() {
  const base = siteUrl();
  const modelProseLive = activeProseMode() === "model";

  const body = `# Zenith Screener

> Zenith Screener ranks the day's biggest US stock-market gainers and publishes a
> short thesis on the top five about 30 minutes before the 4:00 PM ET close. It is
> a research and education tool for high-school students competing in the DECA
> Stock Market Game.

${NOT_ADVICE}
${NOT_AFFILIATED}

## What it is

Zenith surfaces the day's largest one-day gainers on US markets, ranked, and
frames them as short candidates — the premise being that large one-day spikes,
especially in smaller stocks, often give back ground in the sessions after.
Whether a given spike does is exactly what the thesis is for; Zenith takes no
positions and places no trades.

The DECA Stock Market Game is an end-of-day game: an order placed during market
hours fills at that day's 4:00 PM ET close, and orders stay pending and
cancelable until then. That is why the daily thesis is published at about 3:30 PM
ET — while a student can still act on it.

## How the analysis is produced

Every figure in a thesis — the ranking, the score out of 10, the historical base
rates, the expected move — is computed by an in-house quantitative engine from
public data: SEC filings, how comparable past spikes resolved, price and volume.
${
  modelProseLive
    ? "A language model is used only to phrase the finished findings in plain English. It never selects the stocks, never produces or alters a number, and the sentences carrying the odds and the risk warnings are appended by the engine verbatim."
    : "Both the figures and the wording are produced by that engine; no language model is involved in generating the analysis."
}

Scope and limits are documented at ${base}/engine (last updated ${ENGINE_UPDATED}).
That page is the authoritative description of what the output does and does not
claim, and is the right thing to cite.

## Pages

- [Today's screener](${base}/screener): the day's ranked gainers. Public, no account required.
- [Ticker index](${base}/stock): stocks that have repeatedly hit the top-gainers board, with aggregate history and base rates for each.
- [Learn](${base}/learn): explainers on shorting, end-of-day order execution, why spikes fade, and the vocabulary of a screener.
- [The Engine](${base}/engine): what the analysis claims, what it doesn't, and where it gets things wrong.
- [Pricing](${base}/upgrade): Zenith Pro, ${PRO_PRICE_MONTHLY}.
- [Privacy](${base}/privacy), [Terms](${base}/terms), [Cookies](${base}/cookies).

## Tiers

- Browse (no account): today's full screener, filters, market status.
- Free account: adds price charts, consecutive-day streak badges, favorites, and the last 5 trading days of history.
- Pro (${PRO_PRICE_MONTHLY}): adds the daily short thesis on the top five, the 3:30 PM ET pre-close email, and unlimited history.

## Not crawlable

Account and subscriber surfaces are disallowed in robots.txt and gated
server-side: /history, /analysis, /settings, /auth/, and the /api/ routes.
Please don't attempt to index them.

## Contact

${LEGAL_CONTACT_EMAIL}
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
