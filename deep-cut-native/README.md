# Deep Cut — Native (React Native / Expo)

The native iOS/Android client for [Deep Cut](https://thedeepcut.xyz). It is a
**client only**: all recommendation logic, LLM calls, TMDB, and Stripe live in
the deployed Next.js backend at the repository root. See `../RN-BUILD-PLAN.md`
for the architecture and phase roadmap, and `../HANDOFF.md` for the product.

## Status — Phase 1 (shipped)

- ✅ Gate and onboarding: sign-in, 8+ starter films, services, signature film,
  handle, and the same <8-loved rule as web
- ✅ Tonight: recommendations, obscurity dial, vibes, service filters,
  watchlist/pass, and "seen it" reactions
- ✅ Social and member surfaces: community, profiles, takes, mixtapes, and
  movie/playlist detail screens
- ✅ TV and participation: Settle It, Just Roll It, TV, and voting screens
- ✅ Settings: streaming services, account settings, and web-based membership
- ✅ Push and links: Expo notifications and auth deep-link handling

Continue validating parity and store readiness against the current source and
[`LAUNCH.md`](./LAUNCH.md); this list is an overview, not a claim that every web
flow is complete natively.

## Run it

```bash
npm install
npx expo start --clear  # scan the QR with Expo Go (iOS/Android)
```

Sign in with an existing Deep Cut account. Public signups are disabled
(invite-only) — members who joined via an invite link must set a password on
thedeepcut.xyz → Settings once, then sign in here.

## Config

Runtime config lives in `app.json → expo.extra` (all values public by design;
RLS is the security boundary):

- `apiBaseUrl` — the deployed backend (`https://thedeepcut.xyz`)
- `supabaseUrl`, `supabaseAnonKey`

Auth against the backend rides as `Authorization: Bearer <access_token>`;
the backend's `currentUser()` validates it (`../src/lib/supabase/server.ts`).

## Builds

Device builds & store submission via EAS:

```bash
npm i -g eas-cli
eas login
eas build --platform ios
```

Bundle ids are set (`xyz.thedeepcut.app`). Before App Store submission, hide
any purchase links per the reader-app rules (RN-BUILD-PLAN §6).

## Verification done in-repo

- `npx tsc --noEmit` — clean (strict)
- `npx expo export --platform ios` — Hermes bundle compiles (3.1MB .hbc)
- `npx expo export --platform web` — bundles (SSR-guarded Supabase client)

> The app currently uses Expo SDK 57. Keep Expo package versions aligned with
> that SDK when changing dependencies; check the Expo SDK 57 compatibility
> table before upgrading.
