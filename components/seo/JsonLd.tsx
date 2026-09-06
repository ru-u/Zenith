// Structured data (schema.org JSON-LD).
//
// Two audiences. Google reads it for rich results; answer engines (ChatGPT,
// Claude, Perplexity) read it to work out what this site IS — which matters more
// here than usual, because "Zenith" is a heavily contested name (Zenith
// Electronics, Zenith watches, Zenith Bank). Naming the entity "Zenith Screener"
// consistently in the graph is the only lever we have on that.
//
// WHY dangerouslySetInnerHTML: this is the repo's first, and it is required —
// React escapes a <script> text child, which corrupts the JSON. The input is our
// own object literal, never user content, and the `<` escape below closes the
// only injection vector that matters (a "</script>" appearing inside a string).
// next.config.ts's CSP note is updated to match; if user-authored content ever
// reaches this component, that reasoning no longer holds.
//
// RULE FOR ADDING TYPES: never emit Review, Rating, Recommendation or
// FinancialProduct for a thesis or a short score. That markup asserts an
// investment recommendation about a real security, which is exactly what
// NOT_ADVICE in lib/legal.ts says Zenith does not do.

type Node = Record<string, unknown>;

export function JsonLd({ data }: { data: Node | Node[] }) {
  const json = JSON.stringify(
    Array.isArray(data)
      ? { "@context": "https://schema.org", "@graph": data }
      : { "@context": "https://schema.org", ...data },
  ).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
