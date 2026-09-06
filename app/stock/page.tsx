import type { Metadata } from "next";
import Link from "next/link";
import { LegalSection, LegalShell } from "@/components/legal/LegalPage";
import { Disclaimer } from "@/components/legal/Disclaimer";
import { qualifyingTickers, MIN_BOARD_APPEARANCES } from "@/lib/tickerPages";

// Crawl entry point for /stock/[ticker]. Without it those pages are reachable
// only from the sitemap, which gets them discovered but gives them no internal
// links at all.
export const metadata: Metadata = {
  title: "Tickers that keep hitting the board",
  description:
    "Every stock that has repeatedly appeared among the day's biggest US market gainers on Zenith, with how often it spikes and what has typically followed.",
  alternates: { canonical: "/stock" },
};

export default async function StockIndexPage() {
  const tickers = await qualifyingTickers();

  return (
    <LegalShell
      eyebrow="Tickers"
      title="Tickers that keep hitting the board"
      description={`Stocks that have appeared among the day's biggest US gainers at least ${MIN_BOARD_APPEARANCES} times since Zenith started tracking.`}
      unique="stock-index"
    >
      <LegalSection title="Why these and not others">
        <p>
          Thousands of stocks have made the board once. These are the ones that
          keep coming back — enough times that there is something to say about
          how they behave, rather than a single day of noise. Each page carries
          the aggregate: how often it has spiked, the typical size of the move,
          and what has historically followed spikes of that shape.
        </p>
        <Disclaimer className="px-0 pt-1" />
      </LegalSection>

      <LegalSection title={`All ${tickers.length} tickers`}>
        <ul className="grid grid-cols-3 gap-x-4 gap-y-2 pt-1 sm:grid-cols-5 [&_li]:ml-0 [&_li]:list-none">
          {tickers.map((t) => (
            <li key={t}>
              <Link
                href={`/stock/${t}`}
                className="font-mono text-sm text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
              >
                {t}
              </Link>
            </li>
          ))}
        </ul>
      </LegalSection>
    </LegalShell>
  );
}
