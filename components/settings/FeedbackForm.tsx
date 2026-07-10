"use client";

import { useState } from "react";
import { Bug, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FeedbackType = "bug" | "feature";

const TYPES: { value: FeedbackType; label: string; Icon: typeof Bug }[] = [
  { value: "bug", label: "Report a bug", Icon: Bug },
  { value: "feature", label: "Suggest a feature", Icon: Lightbulb },
];

const PLACEHOLDER: Record<FeedbackType, string> = {
  bug: "What went wrong? Include what you clicked and what you expected to happen.",
  feature: "What would make Zenith more useful for you?",
};

export function FeedbackForm() {
  const [type, setType] = useState<FeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, message }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Something went wrong. Please try again.");
      }
      setSent(true);
      setMessage("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-up">
          Thanks — your {type === "bug" ? "report" : "suggestion"} is in.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => setSent(false)}
          className="border-foreground/10 bg-foreground/5 hover:bg-foreground/10"
        >
          Send another
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="inline-flex w-fit items-center gap-1 rounded-lg border border-border bg-secondary/40 p-1">
        {TYPES.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setType(value)}
            aria-pressed={type === value}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              type === value
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <textarea
        required
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={PLACEHOLDER[type]}
        maxLength={2000}
        rows={4}
        className="w-full resize-y rounded-lg border border-foreground/10 bg-foreground/5 px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-brand/50"
      />

      {error && <p className="text-sm text-down">{error}</p>}

      <Button
        type="submit"
        disabled={sending || message.trim() === ""}
        className="w-fit bg-brand text-brand-foreground hover:bg-brand/90"
      >
        {sending ? "Sending…" : "Send feedback"}
      </Button>
    </form>
  );
}
