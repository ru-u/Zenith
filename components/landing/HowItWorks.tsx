import { Reveal } from "./Reveal";

// The steps are labeled with their ET clock times rather than 1/2/3 — the
// order IS the information: the DECA End-of-Day game runs on a daily clock,
// and each step exists because of the one before it.
const STEPS = [
  {
    time: "9:30 – 4:00 ET",
    title: "The screener",
    body: "Every trading day, Zenith ranks the biggest US gainers — price, volume, market cap, and how many days each has run in a row.",
  },
  {
    time: "~3:30 PM ET",
    title: "The 3:30 drop",
    body: "About 30 minutes before the close, an AI short thesis lands on the top five: what drove the spike, what could hold it up, and a call.",
  },
  {
    time: "4:00 PM ET",
    title: "The close",
    body: "In the DECA Stock Market Game, orders placed before 4:00 PM ET fill at that day's closing price. Read the drop, pick your short, get the order in.",
  },
] as const;

export function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-20">
      <Reveal>
        <h2 className="text-3xl font-semibold tracking-tight text-balance">
          One decision a day, on a clock
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          The game fills every order at the close — so the whole day funnels
          into one moment. Zenith is built around it.
        </p>
        <ol className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li
              key={s.time}
              className="group relative overflow-hidden rounded-2xl bg-white/3 p-6 ring-1 ring-white/6 transition-colors hover:bg-white/5 hover:ring-brand/25"
            >
              {/* soft brand bloom that answers the hero's glow on hover */}
              <div
                aria-hidden
                className="pointer-events-none absolute -top-16 left-1/2 h-32 w-48 -translate-x-1/2 rounded-full bg-brand/10 blur-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              />
              <span className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-brand">
                {s.time}
              </span>
              <h3 className="mt-3 font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </Reveal>
    </section>
  );
}
