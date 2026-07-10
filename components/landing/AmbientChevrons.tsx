import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// The landing signature: the Zenith mark (a double chevron) blown up to
// architectural scale and set adrift behind the content — glow beams below,
// a crisp line-trace on top, film grain over everything. Pure SVG + CSS
// (keyframes live in globals.css, gated on prefers-reduced-motion), server-
// renderable, no per-frame JS.
//
// "hero" is the loud statement; "echo" is the same geometry at whisper
// opacity for recurring use further down the page.
//
// (A filled-ribbon variant was tried and rolled back by request — this is
// the line-work original. If revisiting: solid strokes for hairlines, keep
// the trace svg uniformly scaled, and keep comet dash metrics in sync with
// the path length.)
// ---------------------------------------------------------------------------

type Variant = "hero" | "echo";

/** "M x1 y1 L apex L x2 y2" — one chevron stroke, the logo's core gesture. */
function chevron(cx: number, cy: number, w: number, rise: number): string {
  return `M ${cx - w / 2} ${cy} L ${cx} ${cy - rise} L ${cx + w / 2} ${cy}`;
}

// The mark's stacked pair, centered. Proportions are relaxed from the 24px
// logo (flatter rise) so the shape reads as a horizon at hero scale.
const W = 1320;
const RISE = 350;
const CX = 720;
const PAIR = [chevron(CX, 640, W, RISE), chevron(CX, 812, W, RISE)];
// A smaller offset echo pair, up and to the right, for depth.
const ECHO_PAIR = [
  chevron(CX + 330, 470, W * 0.55, RISE * 0.55),
  chevron(CX + 330, 566, W * 0.55, RISE * 0.55),
];

function Layer({
  className,
  style,
  strokeWidth,
  paths,
  gradientId,
  pathClassName,
  opacities,
}: {
  className?: string;
  style?: React.CSSProperties;
  strokeWidth: number;
  paths: string[];
  gradientId: string;
  pathClassName?: string;
  opacities: number[];
}) {
  return (
    <svg
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      className={cn("absolute inset-0 h-full w-full", className)}
      style={style}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="var(--brand-2)" />
          <stop offset="0.55" stopColor="var(--brand)" />
          <stop offset="1" stopColor="var(--foreground)" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={opacities[i] ?? opacities[0]}
          className={pathClassName}
        />
      ))}
    </svg>
  );
}

export function AmbientChevrons({
  variant = "hero",
  className,
  unique,
}: {
  variant?: Variant;
  className?: string;
  unique: string;
}) {
  const hero = variant === "hero";
  const id = (layer: string) => `ascent-${unique}-${layer}`;
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        // Dissolve the field toward the edges so it never presents a hard
        // boundary (screen-edge clipping reads as a bug, not a vibe). The
        // radial handles the sides; the linear on the inner wrapper below
        // guarantees full transparency at the container's bottom edge, where
        // the chevron arms would otherwise be chopped by the section's
        // overflow clip. Two nested single-layer masks instead of
        // `mask-intersect`: Safari mis-composites multi-layer masks (its
        // legacy -webkit-mask-composite model), which un-fades the bottom and
        // exposes the hard clip. Nested masks multiply alphas — the same
        // math as `intersect` — and every engine handles one layer/element.
        "mask-[radial-gradient(120%_90%_at_50%_42%,black_55%,transparent_98%)]",
        className,
      )}
      aria-hidden
    >
      <div className="absolute inset-0 mask-[linear-gradient(to_bottom,black_70%,transparent_98%)]">
        {/* Glow beams — the light source. Heavy blur, slowest drift; the
            breathe lives on the child svg (stacking two animate-* utilities on
            one element would override the `animation` shorthand). */}
        <div className="absolute inset-0 animate-ascent-rise" style={{ animationDuration: "42s" }}>
          <Layer
            gradientId={id("glow")}
            className={cn("blur-[70px]", hero && "animate-ascent-breathe")}
            strokeWidth={hero ? 130 : 90}
            paths={PAIR}
            opacities={hero ? [0.14, 0.1] : [0.08, 0.06]}
          />
        </div>

        {/* Mid beams — body of the mark. */}
        <div className="absolute inset-0 animate-ascent-rise" style={{ animationDuration: "30s" }}>
          <Layer
            gradientId={id("mid")}
            className="blur-[14px]"
            strokeWidth={hero ? 20 : 12}
            paths={hero ? [...PAIR, ...ECHO_PAIR] : PAIR}
            opacities={hero ? [0.16, 0.11, 0.08, 0.06] : [0.1, 0.07]}
          />
        </div>

        {/* Line-trace — the wireframe of the logo, crisp, with a slow light
            packet running the path (hero only). */}
        <div className="absolute inset-0 animate-ascent-rise" style={{ animationDuration: "24s" }}>
          <Layer
            gradientId={id("trace")}
            strokeWidth={1.5}
            paths={hero ? [...PAIR, ...ECHO_PAIR] : PAIR}
            opacities={hero ? [0.4, 0.28, 0.18, 0.12] : [0.2, 0.14]}
          />
          {hero && (
            <Layer
              gradientId={id("comet")}
              strokeWidth={2.5}
              paths={[PAIR[0]]}
              opacities={[0.9]}
              pathClassName="trace-comet"
            />
          )}
        </div>

        {/* Film grain, hero only (echoes are too faint to band). */}
        {hero && <div className="grain absolute inset-0 opacity-[0.055] mix-blend-soft-light" />}
      </div>
    </div>
  );
}
