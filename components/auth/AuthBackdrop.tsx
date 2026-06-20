import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

// Static, realistic-looking data — purely decorative.
const ROWS = [
  { t: "QURE", c: "+78.44%", p: "$48.16", s: "Health Technology" },
  { t: "ELTX", c: "+70.65%", p: "$4.71", s: "Health Technology" },
  { t: "CAST", c: "+56.70%", p: "$8.07", s: "Technology Services" },
  { t: "BFLY", c: "+55.87%", p: "$8.90", s: "Health Technology" },
  { t: "HQ", c: "+35.54%", p: "$32.00", s: "Technology Services" },
  { t: "KALA", c: "+26.89%", p: "$3.61", s: "Health Technology" },
  { t: "MFI", c: "+25.64%", p: "$9.88", s: "Technology Services" },
  { t: "OM", c: "+25.62%", p: "$5.05", s: "Health Technology" },
  { t: "APLM", c: "+25.34%", p: "$17.50", s: "Finance" },
  { t: "MEI", c: "+21.18%", p: "$14.02", s: "Electronic Technology" },
];

const DATES = [
  "Thu, Jun 18",
  "Wed, Jun 17",
  "Tue, Jun 16",
  "Mon, Jun 15",
  "Fri, Jun 12",
  "Thu, Jun 11",
  "Wed, Jun 10",
  "Tue, Jun 9",
];

function Table() {
  return (
    <div className="overflow-hidden rounded-2xl border border-foreground/10 bg-foreground/[0.03]">
      {ROWS.map((g, i) => (
        <div
          key={g.t}
          className="flex items-center gap-4 border-b border-foreground/5 px-5 py-3.5"
        >
          <span className="w-5 text-sm text-muted-foreground">{i + 1}</span>
          <span className="w-16 font-semibold tracking-tight">{g.t}</span>
          <span className="flex-1 truncate text-sm text-muted-foreground">
            {g.s}
          </span>
          <span className="w-20 text-right tabular-nums">{g.p}</span>
          <span className="w-20 text-right font-semibold tabular-nums text-up">
            {g.c}
          </span>
        </div>
      ))}
    </div>
  );
}

// Hero cards + table — the live "today" screener.
function ScreenerMock() {
  return (
    <div className="mx-auto max-w-6xl px-6 pt-16">
      <div className="grid grid-cols-3 gap-3 lg:grid-cols-5">
        {ROWS.slice(0, 5).map((g) => (
          <div
            key={g.t}
            className="flex flex-col gap-2 rounded-2xl border border-foreground/10 bg-foreground/[0.04] p-5"
          >
            <span className="text-base font-semibold tracking-tight">{g.t}</span>
            <span className="mt-6 inline-flex items-center gap-1 text-2xl font-bold text-up">
              <TrendingUp className="h-4 w-4" />
              {g.c}
            </span>
            <span className="text-sm text-muted-foreground">{g.p}</span>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <Table />
      </div>
    </div>
  );
}

// Date sidebar + table — the History browser.
function HistoryMock() {
  return (
    <div className="mx-auto max-w-6xl px-6 pt-16">
      <div className="grid gap-4 md:grid-cols-[200px_1fr]">
        <div className="flex h-fit flex-col gap-1.5 rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-2">
          {DATES.map((d, i) => (
            <div
              key={d}
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                i === 0
                  ? "bg-brand/20 text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {d}
            </div>
          ))}
        </div>
        <Table />
      </div>
    </div>
  );
}

/**
 * Decorative, non-interactive blurred preview that sits behind the auth card —
 * so signing in feels like it's happening "over" the product instead of on an
 * empty black screen. The variant matches where the user is headed: History
 * funnels show the History browser; everything else shows the screener.
 */
export function AuthBackdrop({
  variant = "screener",
}: {
  variant?: "screener" | "history";
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 select-none overflow-hidden"
    >
      <div className="absolute inset-x-0 top-0 origin-top scale-[1.12] opacity-60 blur-[10px]">
        {variant === "history" ? <HistoryMock /> : <ScreenerMock />}
      </div>
      {/* dim layer so the auth card stays readable */}
      <div className="absolute inset-0 bg-background/45" />
    </div>
  );
}
