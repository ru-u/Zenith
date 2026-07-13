import { Reveal } from "./Reveal";

// The steps are labeled with their ET clock times rather than 1/2/3 — the
// order IS the information: the DECA End-of-Day game runs on a daily clock,
// and each step exists because of the one before it.
const STEPS = [
  {
    time: "9:30 – 4:00 ET",
    title: "The screener",
    body: "Every trading day, Zenith ranks the biggest US gainers by percent gain, with price, volume, market cap, and how many days each has run in a row.",
  },
  {
    time: "~3:30 PM ET",
    title: "The 3:30 drop",
    body: "About 30 minutes before the close, the quant engine drops a short thesis on the top five: the catalyst behind the spike, how similar spikes have played out before, and a short-rating out of 10.",
  },
  {
    time: "4:00 PM ET",
    title: "The close",
    body: "In the DECA Stock Market Game, orders placed before 4:00 PM ET fill at that day's closing price. Read the drop and get your order in before the close.",
  },
] as const;

export function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-20">
      <Reveal>
        <h2 className="text-3xl font-semibold tracking-tight text-balance">
          Built around the 4:00 close
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          In the DECA Stock Market Game, every order placed during the day fills at that
          day&apos;s 4:00 PM close. Zenith ranks the gainers all session, then
          posts its analysis at 3:30 so you have half an hour to pick a short
          and place the order.
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
