// Shared constants for the legal pages (/privacy, /terms, /cookies) and for the
// disclaimers that ride along with the product surfaces themselves.
// Update LEGAL_UPDATED whenever any policy text changes.
export const LEGAL_CONTACT_EMAIL = "support@zenithscreener.com";

// The From address on Supabase's auth email (confirmations, password resets).
// Shown to users so they can search their mail for it and whitelist it — every
// resend that prevents is one back in Resend's 100/day account quota, which is
// shared with the pre-close drop (see CLAUDE.md).
// NOT read by any send path: the value lives in Supabase's custom SMTP config
// (Authentication -> Emails -> SMTP, sender address). If it is changed there,
// change it here — nothing will fail loudly if they drift.
export const AUTH_EMAIL_SENDER = "auth@zenithscreener.com";
export const LEGAL_UPDATED = "September 6, 2026";

// /engine (how the thesis engine works) is disclosure, not policy — it changes
// when the engine changes, which is a different cadence from the policy pages.
// Bump this on a scoring/prose change; don't drag LEGAL_UPDATED along with it.
export const ENGINE_UPDATED = "September 6, 2026";

// The two lines that must be visible wherever Zenith shows a ranking or a
// thesis — not only on /terms. NOT_ADVICE is the securities disclaimer;
// NOT_AFFILIATED is the trademark one (we use "DECA" and "Stock Market Game"
// nominatively, so the disclaimer has to sit near the use, not three clicks
// away). Single source of truth: <Disclaimer>, AppFooter, LandingFooter and the
// pre-close email all read these, so the wording can never drift between them.
export const NOT_ADVICE =
  "Not investment advice — an educational tool for the DECA Stock Market Game.";

export const NOT_AFFILIATED =
  "Not affiliated with or endorsed by DECA Inc. or the SIFMA Foundation.";

/** Both disclaimers as one sentence, for tight spots (email footer, hero). */
export const DISCLAIMER_LINE = `${NOT_ADVICE} ${NOT_AFFILIATED}`;
