/**
 * Fixed, animated radial gradient-mesh backdrop that sits behind all content.
 * Pure CSS (see `.gradient-mesh` in globals.css); respects prefers-reduced-motion.
 */
export function GradientMesh() {
  return <div className="gradient-mesh" aria-hidden="true" />;
}
