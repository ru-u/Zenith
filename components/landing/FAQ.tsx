import { ChevronDown } from "lucide-react";
import { Reveal } from "./Reveal";

// Native <details>/<summary> — accessible, zero JS, and the restrained answer
// for a section whose whole job is plain talk. Written for a skeptical DECA
// competitor; honesty is the trust signal a pre-launch product actually has.
const QA = [
  {
    q: "How does shorting actually work?",
    a: "Shorting is a bet that a price will fall. You sell borrowed shares today, then buy them back later — if the price has dropped, the difference is your profit; if it rises instead, that difference is your loss. In the game it's one step: place a short order, and you gain when the stock closes lower than where you shorted it.",
  },
  {
    q: "Why short the day's biggest gainers?",
    a: "Big one-day spikes — especially in smaller stocks running on hype instead of numbers — tend to give back ground in the days after. Not always, which is the point of the thesis: it separates spikes with something underneath from spikes running on air. You still make the call.",
  },
  {
    q: "How do trades work in the DECA game?",
    a: "It's an end-of-day game. Any order you place during market hours fills at that day's 4:00 PM ET closing price; place it after the close and it fills at the next day's close. Orders stay pending and cancelable until the close — which is why the thesis drops at ~3:30, while you can still act on it.",
  },
  {
    q: "Is using Zenith allowed in the competition?",
    a: "Zenith is a research tool — a screener plus analysis, like reading a finance site before you trade. You place your own trades in the official game. Rules can vary by chapter and event, so check yours if you're unsure.",
  },
  {
    q: "What do I get without paying?",
    a: "The full screener — today's ranked gainers, streaks, and charts — with no account at all. A free account adds the last 5 days of history and the 3:30 email. Pro ($4.99/mo) adds the daily AI short thesis, unlimited history, and watchlist alerts.",
  },
  {
    q: "Is this investment advice?",
    a: "No. Zenith is built for a simulated trading competition and for learning how markets move. Nothing here is advice about real money.",
  },
] as const;

export function FAQ() {
  return (
    <section id="faq" className="mx-auto w-full max-w-3xl scroll-mt-20 px-6 py-20">
      <Reveal>
        <h2 className="text-3xl font-semibold tracking-tight text-balance">
          Frequently Asked Questions
        </h2>
        <div className="mt-8 divide-y divide-white/6 rounded-2xl bg-white/2 ring-1 ring-white/6">
          {QA.map(({ q, a }) => (
            <details key={q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium transition-colors hover:text-brand [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {a}
              </p>
            </details>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
