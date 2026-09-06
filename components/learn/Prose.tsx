import Link from "next/link";

// Minimal inline formatting for the /learn article bodies: [label](/path) links
// and **bold**. Parsed into React nodes — never HTML — so an article string
// cannot introduce markup, and this stays clear of the CSP reasoning in
// next.config.ts (the only dangerouslySetInnerHTML in the repo is JsonLd).
//
// Deliberately tiny. If an article ever needs more than links and bold, that is
// a sign it wants its own page component, not a bigger parser here.
//
// Built with matchAll + flatMap rather than a push loop: the React Compiler's
// immutability lint rejects accumulating into an array during render.

const TOKEN = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;

export function Prose({ text }: { text: string }) {
  const matches = [...text.matchAll(TOKEN)];

  const nodes = matches.flatMap((m, i) => {
    const prev = matches[i - 1];
    const from = prev ? (prev.index ?? 0) + prev[0].length : 0;
    const lead = text.slice(from, m.index);
    const el =
      m[1] != null ? (
        <Link
          key={`l${m.index}`}
          href={m[2]}
          className="underline underline-offset-2 transition-colors hover:text-foreground"
        >
          {m[1]}
        </Link>
      ) : (
        <strong key={`b${m.index}`}>{m[3]}</strong>
      );
    return lead ? [lead, el] : [el];
  });

  const lastMatch = matches[matches.length - 1];
  const tail = text.slice(
    lastMatch ? (lastMatch.index ?? 0) + lastMatch[0].length : 0,
  );

  return (
    <p>
      {nodes}
      {tail}
    </p>
  );
}
