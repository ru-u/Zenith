"use client";

import { useEffect, useId, useRef } from "react";
import { useTheme } from "next-themes";
import { qualifiedSymbol } from "@/lib/marketdata/symbols";
import { cn } from "@/lib/utils";

// The chart's footprint, shared so the sign-up gate and the loading state in
// ChartDialog keep matching it exactly (a mismatch makes the dialog resize
// under the user when auth resolves). 680px is the desktop size this has
// always been; on a phone that alone overflowed the viewport, so it becomes a
// fraction of the small viewport height with a floor for landscape.
export const CHART_FOOTPRINT = "h-[60svh] min-h-72 sm:h-170";

declare global {
  interface Window {
    TradingView: {
      widget: new (config: Record<string, unknown>) => unknown;
    };
  }
}

// Mounts the interactive TradingView Advanced Chart widget. Rendered with
// key={ticker} at the call site so React fully remounts (and re-runs this
// effect) when the symbol changes.
//
// `autosize: true` is what keeps the chart fully interactive: it fills the
// container and re-fits as the dialog animates open, instead of locking to a
// fixed size measured mid-animation (which renders a dead snapshot).
//
// autosize alone is not enough, though — see the nudge() in the effect: the
// embed sizes itself from its iframe's viewport once at bootstrap and after
// that only re-fits on `resize` events *inside* the iframe. When it bootstraps
// before the browser has pushed the iframe's real bounds (a race — the dialog
// opening mid view-transition/animation, or the main thread busy committing
// the popup), it lays out against Chromium's default 800×600 frame viewport;
// the iframe's true geometry never changes afterwards, so no resize ever
// fires and the chart stays a letterboxed 800×600 snapshot in the corner of
// the dialog.
export function StockChart({
  ticker,
  exchange = null,
}: {
  ticker: string;
  // Listing venue ("NASDAQ" | "NYSE") — REQUIRED whenever the caller has it.
  // A bare symbol makes TradingView guess the venue, and for brand-new
  // listings it guesses wrong (day-one "BIOT" resolved to a BitMEX crypto
  // index). Null only for legacy rows stored before the exchange column.
  exchange?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Unique per instance. TradingView resolves the mount point via
  // document.getElementById(container_id), so a shared id is dangerous: during a
  // close→reopen the closing dialog's StockChart and the opening one briefly
  // coexist with the same id, and getElementById grabs the FIRST (stale, closing)
  // node — the new widget renders into a detached container and the dialog shows
  // a dead, non-interactive snapshot. A per-instance id keeps every chart live.
  const containerId = `tv_${useId().replace(/[^a-zA-Z0-9_]/g, "")}`;
  const { resolvedTheme } = useTheme();
  const chartTheme = resolvedTheme === "light" ? "light" : "dark";

  useEffect(() => {
    let cancelled = false;
    const el = containerRef.current;
    const timers: number[] = [];
    let iframe: HTMLIFrameElement | null = null;

    // Force a real `resize` event inside the TradingView iframe: shrink the
    // container by 1px for one frame, then restore it. If the embed booted
    // against a stale/default viewport (see header comment), this makes it
    // re-measure and fill the dialog; if it was already right, the one-frame
    // 1px blip is invisible.
    function nudge() {
      if (cancelled || !el) return;
      el.style.height = "calc(100% - 1px)";
      requestAnimationFrame(() => {
        if (!cancelled && el) el.style.height = "100%";
      });
    }

    // Straddle the embed's async bootstrap: once as it loads, again after its
    // chart bundle has had time to parse and attach, once more for slow loads.
    function onFrameLoad() {
      for (const ms of [0, 600, 2000]) {
        timers.push(window.setTimeout(nudge, ms));
      }
    }

    function init() {
      if (cancelled || !el) return;
      el.innerHTML = ""; // clear any prior widget (StrictMode / remount safety)
      el.style.height = "100%"; // in case a prior cleanup landed mid-nudge
      new window.TradingView.widget({
        autosize: true,
        // Qualified "NASDAQ:BIOT"-style symbol — a bare ticker lets
        // TradingView pick the venue, which mis-resolves new listings.
        symbol: qualifiedSymbol(exchange, ticker),
        interval: "D",
        timezone: "America/New_York",
        theme: chartTheme, // follow the app's light/dark theme
        style: "3", // area chart — readable for students new to candles
        // Recolor the area series from TradingView's default blue to brand cyan.
        overrides: {
          "mainSeriesProperties.areaStyle.linecolor": "#2EE6E6",
          "mainSeriesProperties.areaStyle.linewidth": 2,
          "mainSeriesProperties.areaStyle.color1": "rgba(46, 230, 230, 0.30)",
          "mainSeriesProperties.areaStyle.color2": "rgba(46, 230, 230, 0.02)",
          // Regular trading hours only. Legacy rows without an exchange still
          // pass a bare symbol, which TradingView resolves to the Cboe One 24h
          // feed and leaks its new Overnight session onto even the daily chart
          // — a purple "Overnight" price tag stacked on the last-price tag
          // (burying the axis label), a moon badge, and a flat line dragging
          // the series past the close. Harmless on qualified symbols, so it
          // stays for both. This is the programmatic RTH toggle.
          "mainSeriesProperties.sessionId": "regular",
        },
        locale: "en",
        hide_top_toolbar: false,
        hide_legend: false,
        enable_publishing: false,
        save_image: false,
        container_id: containerId,
      });
      // The widget inserts its iframe synchronously; watch it come up so the
      // post-load nudges can heal a wrong-viewport bootstrap.
      iframe = el.querySelector("iframe");
      iframe?.addEventListener("load", onFrameLoad);
    }

    if (typeof window.TradingView !== "undefined") {
      init();
    } else {
      const existing = document.getElementById("tv-js-script");
      if (existing) {
        existing.addEventListener("load", init);
      } else {
        const script = document.createElement("script");
        script.id = "tv-js-script";
        script.src = "https://s3.tradingview.com/tv.js";
        script.async = true;
        script.onload = init;
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      iframe?.removeEventListener("load", onFrameLoad);
      for (const t of timers) window.clearTimeout(t);
      if (el) el.innerHTML = "";
    };
  }, [ticker, exchange, chartTheme, containerId]);

  return (
    <div className={cn("w-full", CHART_FOOTPRINT)}>
      <div
        id={containerId}
        ref={containerRef}
        style={{ height: "100%", width: "100%" }}
      />
    </div>
  );
}
