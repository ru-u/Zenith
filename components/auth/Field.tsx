import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A labelled field for the auth forms.
 *
 * Every auth input used to be placeholder-only with an aria-label, which had
 * two costs. Visually the forms read as a stack of identical grey pills with
 * nothing to separate one from the next. Practically the placeholder was doing
 * two jobs at once — "Password (min 8 chars)" was a label AND a constraint, and
 * the constraint vanished the moment someone started typing, which is exactly
 * when they need it. A real <label> restores the hierarchy and `help` keeps the
 * rule on screen.
 *
 * Extracted from components/settings/ProfileForm.tsx, which was the only
 * visible-label pattern in the app, so this stays consistent with /settings.
 *
 * h-10 rather than the primitive's h-8: 40px is the module the auth forms are
 * built on (Google's button and the submit match it). Input's own
 * `text-base md:text-sm` survives the merge and must — 16px is what stops iOS
 * zooming the page on focus.
 */
export function Field({
  id,
  label,
  help,
  className,
  ...props
}: React.ComponentProps<"input"> & {
  id: string;
  label: string;
  help?: React.ReactNode;
}) {
  const helpId = help ? `${id}-help` : undefined;

  return (
    <div className="flex flex-col gap-1">
      {/* `help` shares the label's line rather than taking one of its own —
          on a form this tall a whole extra row per hint is real scroll. */}
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {help && (
          <span id={helpId} className="text-xs text-muted-foreground">
            {help}
          </span>
        )}
      </div>
      <Input
        id={id}
        aria-describedby={helpId}
        className={cn("h-10 border-foreground/10 bg-foreground/5", className)}
        {...props}
      />
    </div>
  );
}
