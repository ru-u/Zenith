"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

// Shared "create a free account" gate body used by BOTH the favorite popup
// (SignupPromptDialog) and the chart popup (ChartSignupGate), so every free-tier
// gate in the app reads as one system — same medallion, same copy rhythm, same
// CTA row.
//
// The glyph renders in the signature cyan→polar-white gradient (#streak-grad,
// defined once in the root layout) — the exact treatment of the streak flame and
// the favorited star — so a gate's icon matches the feature it unlocks. A soft
// brand glow behind the disc echoes the page's gradient-mesh backdrop, so the
// popup feels like part of the site rather than a flat slab.
export function AuthGatePrompt({
  icon: Icon,
  title,
  description,
  next,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  next: string; // already URL-encoded return path
}) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="relative flex items-center justify-center">
        {/* Brand bloom — a plain box glow, deliberately NOT backdrop-filter:
            base-ui positions popups with a transform, which breaks backdrop
            blur in Chrome (see .glass-popover in globals.css). */}
        <span
          aria-hidden
          className="absolute h-16 w-16 rounded-full bg-brand/25 blur-2xl"
        />
        {/* Glassy medallion: brand-tinted gradient fill + inset top highlight +
            hairline brand ring, mirroring the site's glass icon discs. */}
        <span className="relative flex h-16 w-16 items-center justify-center rounded-full border border-brand/25 bg-gradient-to-b from-brand/20 to-brand/5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.16)]">
          <Icon
            className="h-7 w-7"
            aria-hidden
            style={{ stroke: "url(#streak-grad)" }}
          />
        </span>
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="mt-1 flex items-center justify-center gap-3">
        <Link
          href={`/auth/signup?next=${next}`}
          className="rounded-lg bg-brand btn-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-[0_0_24px_-4px] shadow-brand/70 transition-transform hover:scale-[1.02]"
        >
          Create free account
        </Link>
        <Link
          href={`/auth/login?next=${next}`}
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
