"use client";

import { useEffect, useRef, useState } from "react";
import type { TrackPoint } from "@/lib/trackRecord";
import { fmtDay, fmtPct, fmtUsd } from "./format";

// Account value after each covered session. One series, so no legend — the
// card title names it. Plain SVG rather than a chart library: one line, one
// baseline and a crosshair don't justify a dependency, and the tokens come
// straight from globals.css so light/dark follow the app theme.

const H = 300;
const M = { t: 16, r: 16, b: 28, l: 56 };

function niceStep(span: number, target: number) {
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => span / x <= target) ?? mag * 10;
}

export function EquityCurve({ points, startingCash }: { points: TrackPoint[]; startingCash: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = points.length;
  const vals = points.map((p) => p.equity);
  const step = niceStep(Math.max(...vals, startingCash) - Math.min(...vals, startingCash), 5);
  const lo = Math.floor(Math.min(...vals, startingCash) / step) * step;
  const hi = Math.ceil(Math.max(...vals, startingCash) / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-6; v += step) ticks.push(v);

  const pw = Math.max(1, w - M.l - M.r);
  const ph = H - M.t - M.b;
  const x = (i: number) => M.l + (n > 1 ? (i / (n - 1)) * pw : pw / 2);
  const y = (v: number) => M.t + ((hi - v) / (hi - lo || 1)) * ph;

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`).join("");
  const area = `${line}L${x(n - 1).toFixed(1)},${y(startingCash).toFixed(1)}L${x(0).toFixed(1)},${y(startingCash).toFixed(1)}Z`;

  const labelEvery = Math.max(1, Math.ceil(n / (w < 520 ? 3 : 6)));
  const last = points[n - 1];
  const hp = hover != null ? points[hover] : null;

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = e.clientX - r.left;
    setHover(Math.max(0, Math.min(n - 1, Math.round(((px - M.l) / pw) * (n - 1)))));
  }

  return (
    <div ref={boxRef} className="relative w-full" style={{ height: H }}>
      {w > 0 && (
        <svg
          width={w}
          height={H}
          viewBox={`0 0 ${w} ${H}`}
          role="img"
          aria-label={`Paper account value from ${fmtUsd(startingCash)} to ${fmtUsd(last.equity)}`}
          className="block overflow-visible font-mono"
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={M.l} x2={M.l + pw} y1={y(v)} y2={y(v)} stroke="var(--border)" />
              <text x={M.l - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted-foreground)">
                ${Math.round(v / 1000)}k
              </text>
            </g>
          ))}
          <line
            x1={M.l}
            x2={M.l + pw}
            y1={y(startingCash)}
            y2={y(startingCash)}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            opacity={0.7}
          />
          {points.map((p, i) =>
            (i % labelEvery === 0 && n - 1 - i >= labelEvery * 0.6) || i === n - 1 ? (
              <text
                key={p.coverDate + i}
                x={x(i)}
                y={H - 8}
                textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
                fontSize={11}
                fill="var(--muted-foreground)"
              >
                {fmtDay(p.coverDate)}
              </text>
            ) : null,
          )}
          <path d={area} fill="var(--brand)" opacity={0.08} />
          <path d={line} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(n - 1)} cy={y(last.equity)} r={4} fill="var(--brand)" stroke="var(--background)" strokeWidth={2} />

          {hp && hover != null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={M.t + ph} stroke="var(--muted-foreground)" opacity={0.5} />
              <circle cx={x(hover)} cy={y(hp.equity)} r={4.5} fill="var(--brand)" stroke="var(--background)" strokeWidth={2} />
            </g>
          )}
          <rect
            x={M.l}
            y={M.t}
            width={pw}
            height={ph}
            fill="transparent"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}

      {hp && hover != null && (
        <div
          className="pointer-events-none absolute z-10 min-w-48 max-w-64 rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
          style={{
            top: 8,
            ...(x(hover) > w / 2 ? { right: w - x(hover) + 12 } : { left: x(hover) + 12 }),
          }}
        >
          <p className="font-semibold">
            {hover === 0 ? `Start · ${fmtDay(hp.coverDate)}` : `Covered ${fmtDay(hp.coverDate)} close`}
          </p>
          <div className="mt-1 flex justify-between gap-4 font-mono tabular-nums">
            <span className="text-muted-foreground">Account</span>
            <span>{fmtUsd(hp.equity)}</span>
          </div>
          {hover > 0 && (
            <div className="flex justify-between gap-4 font-mono tabular-nums">
              <span className="text-muted-foreground">Session</span>
              <span className={hp.ret > 0 ? "text-up" : hp.ret < 0 ? "text-down" : ""}>
                {hp.trades.length ? fmtPct(hp.ret) : "cash"}
              </span>
            </div>
          )}
          {hp.trades.length > 0 && (
            <div className="mt-1.5 space-y-0.5 border-t border-border pt-1.5">
              {hp.trades.map((t) => (
                <div key={t.ticker} className="flex justify-between gap-4 font-mono tabular-nums">
                  <span className="text-muted-foreground">
                    {t.ticker} · {t.score}
                  </span>
                  <span className={t.pnl > 0 ? "text-up" : t.pnl < 0 ? "text-down" : ""}>{fmtPct(t.pnl)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
