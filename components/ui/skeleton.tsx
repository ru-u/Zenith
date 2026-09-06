import { cn } from "@/lib/utils"

// `.skeleton-sweep` (app/globals.css) carries both the fill and the motion, and
// is inert under prefers-reduced-motion on its own — no `motion-reduce:` needed
// here. A caller passing `bg-*` overrides the fill only; the sweep survives.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("skeleton-sweep rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
