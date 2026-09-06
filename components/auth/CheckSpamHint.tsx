import { MailSearch } from "lucide-react";
import { AUTH_EMAIL_SENDER } from "@/lib/legal";

/**
 * "It's probably in spam" — shown wherever we've just told someone to go look
 * for an auth email.
 *
 * This is budget infrastructure, not politeness. Every email we send comes out
 * of Resend's 100/day account quota, which is shared with the pre-close drop
 * (see CLAUDE.md), and the reflex when mail doesn't appear in thirty seconds is
 * to hit Resend — which spends another one. School mail filters are aggressive
 * and this audience is behind them, so the highest-value thing we can do is get
 * people to look in the junk folder BEFORE they resend. Hence: rendered above
 * the resend control, and given real visual weight rather than muted fine print
 * nobody reads.
 */
export function CheckSpamHint({ className }: { className?: string }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-md border border-foreground/10 bg-foreground/[0.06] px-2.5 py-2 ${className ?? ""}`}
    >
      <MailSearch aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
      <p className="text-sm leading-relaxed">
        <span className="font-medium text-foreground">
          Don&apos;t see it? Check your spam or junk folder.
        </span>{" "}
        <span className="text-muted-foreground">
          It comes from {AUTH_EMAIL_SENDER} — mark it &ldquo;not spam&rdquo; so
          the next one reaches your inbox.
        </span>
      </p>
    </div>
  );
}
