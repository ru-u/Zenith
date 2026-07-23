"use client";

import { useEffect, useId, useRef } from "react";
import { useTheme } from "next-themes";

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
export function StockChart({ ticker }: { ticker: string }) {
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

    function init() {
      if (cancelled || !el) return;
      el.innerHTML = ""; // clear any prior widget (StrictMode / remount safety)
      new window.TradingView.widget({
        autosize: true,
        symbol: ticker,
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
          // Regular trading hours only. We pass a bare symbol (no exchange), so
          // TradingView resolves it to the Cboe One 24h feed and leaks its new
          // Overnight session onto even the daily chart — a purple "Overnight"
          // price tag stacked on the last-price tag (burying the axis label),
          // a moon badge, and a flat line dragging the series past the close.
          // This is the programmatic equivalent of the chart's RTH toggle.
          "mainSeriesProperties.sessionId": "regular",
        },
        locale: "en",
        hide_top_toolbar: false,
        hide_legend: false,
        enable_publishing: false,
        save_image: false,
        container_id: containerId,
      });
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
      if (el) el.innerHTML = "";
    };
  }, [ticker, chartTheme, containerId]);

  return (
    <div className="w-full" style={{ height: 680 }}>
      <div
        id={containerId}
        ref={containerRef}
        style={{ height: "100%", width: "100%" }}
      />
    </div>
  );
}
