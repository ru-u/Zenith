# Migrating to asymmetric JWT signing keys

`proxy.ts` verifies the session with `supabase.auth.getClaims()`. That call has two
very different cost profiles and the difference is a **project setting, not code**:

| Project JWT signing | What `getClaims()` does | Cost per signed-in request |
| --- | --- | --- |
| Legacy shared secret (HS256) | Falls back to a server round trip equivalent to `getUser()` | ~150–250 ms |
| Asymmetric (ES256 / RS256) | Verifies the JWT locally with WebCrypto against a cached JWKS | ~0 ms, no network |

The code is already written for the second row and behaves correctly on the first,
so this migration is the switch that actually banks the saving. Nothing needs to be
deployed alongside it.

## Why it is worth doing

`proxy.ts` runs before rendering begins on **every page navigation and every RSC
prefetch**, so its round trip sets the floor on TTFB for signed-in users — it cannot
be hidden behind a Suspense boundary the way the render-path reads now are. It is the
last blocking network hop in front of the document.

Guests are unaffected either way: `getClaims()` / `getUser()` short-circuit with
`AuthSessionMissingError` when there is no session cookie and make no request at all.
This is why signed-out probes of the site have always looked fast.

## Steps

1. Supabase dashboard → **Authentication → JWT Keys**.
2. Start the migration to an asymmetric key. Supabase generates a new ES256 (or
   RS256) key and moves the legacy secret to "previous key".
3. Leave both keys live through the rotation window. Tokens signed with the old
   secret keep validating while sessions roll over, so **no user is signed out**.
4. Once no traffic is validating against the previous key, retire it.

## Verifying it worked

`getClaims()` picks the local path only when the JWT header carries an asymmetric
`alg` and a `kid`. To confirm end to end, measure TTFB with a real session cookie
before and after:

```sh
curl -o /dev/null -b "$COOKIE_JAR" \
  -w 'ttfb=%{time_starttransfer}\n' https://zenithscreener.com/screener
```

Expect a drop of roughly one Railway→Supabase round trip (~150–250 ms). If nothing
changes, the fallback is still being taken — decode the access token and check that
its header `alg` is `ES256`/`RS256` rather than `HS256`.

## What NOT to change

`lib/viewer.ts` stays on `getUser()` on purpose, and this migration does not change
that. It reads `user_metadata` (via `lib/displayName.ts`), and `user_metadata` in a
JWT is a snapshot from token-issue time — `auth-js`'s `updateUser()` reuses the same
access token, so a name edited in `/settings` would not appear in the header until
the token refreshed. `proxy.ts` is safe because it only reads `sub`.
