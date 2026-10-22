# Deep Cut — Developer Handoff

A complete brief for a team picking up **Deep Cut** (live at **https://thedeepcut.xyz**) and shipping it to the App Store / Play Store.

> **TL;DR:** The web app is live, and an Expo iOS/Android client is already in development. Keep the Next.js app as the backend and web client; continue the native client in `deep-cut-native/`. Do not start a separate Capacitor rebuild.

---

## 1. What Deep Cut is

An AI movie-recommendation app with a campy midnight-repertory-theater aesthetic. Users log films they love; an LLM names their "taste threads" and deals them deep-cut recommendations. Three core modes:

- **Deal Me More** (Tonight) — personalized recs with an obscurity dial (crowd-pleasers → buried treasure).
- **Settle It** — a couch-standoff: two people, a quiz, the "house" rules on what to watch.
- **Just Roll It** — a lean-back channel that rolls deep-cut trailers until one grabs you.

Plus: member profiles (signature-film shrine + Spotify theme song), mixtapes/playlists, a Hot Takes wall, follows/feed, watch streaks, an admin console, an invite-only waitlist, and Stripe subscriptions.

**Status: launched-complete.** Signups, payments (live Stripe), UGC safety, and the growth gate all work end-to-end.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 15** (App Router), React 19, TypeScript (strict) |
| Styling | **Tailwind v4** (`@theme` tokens in `globals.css`) — bespoke "camp" design system |
| DB / Auth / Storage | **Supabase** (Postgres + RLS, magic-link & password auth, avatars in Storage) |
| LLM | **Groq** free tier (OpenAI-compatible), strict-JSON + Zod validation, model fallback |
| Movie data | **TMDB** (search/details/providers/discover/images/videos) + **OMDb** (IMDb/RT ratings, optional) |
| Payments | **Stripe** (subscription + one-time), raw REST (no SDK) |
| Email | **Resend** — Supabase SMTP for auth email; direct Resend API for waitlist email |
| Music | **Spotify** IFrame API (profile theme player) |
| Push | Web Push (VAPID) |
| Hosting | **Vercel** (Hobby today — move to **Pro** for commercial use) |
| Tests | Vitest |

The web app is a responsive PWA (installable, service worker, offline page). The
Expo client in `deep-cut-native/` has its core sign-in, onboarding, and Tonight
recommendation loop; see [§10](#10-native-app) and the native launch checklist.

---

## 3. Architecture overview

- **Server-first.** Pages are React Server Components hitting Supabase directly; mutations go through `/app/api/*` route handlers. A service-role client (`src/lib/supabase/admin.ts`) bypasses RLS server-side only.
- **All LLM access** funnels through `src/lib/ai.ts` (strict JSON, one repair pass, model fallback for rate limits). **All TMDB** through `src/lib/tmdb.ts`. Nothing else calls those APIs.
- **Recommendation engine** is `src/lib/engine.ts` (Stage A profile → Stage B candidate gen → TMDB validation → "honest obscurity" scoring → persist). It **degrades gracefully**: if the LLM fails, it falls through to a no-LLM TMDB Discover fallback so a deal never hard-fails.
- **"Honest obscurity"** (`src/lib/obscurity.ts`) is core IP: fame (vote count × popularity) *caps* a film's obscurity score, and films <2 years old can't be "deep cuts." This is what keeps blockbusters out of the deep-cut pools. Tuned across all three surfaces — **change it carefully and re-audit against production.**
- **Graceful degradation everywhere** via env presence: `premiumConfigured()`, `spotifyConfigured()`, `pushConfigured()`, `omdbConfigured()`, `emailConfigured()`, `lifetimeConfigured()`. Missing keys = feature no-ops cleanly, app still runs.

### ⚠️ The events-table fallback pattern (important tech debt)
Several features store data as rows in a generic `events` table (name + JSONB props) **instead of dedicated columns**, so they work before migrations are applied: profile style, premium status, playlist visibility, safety (blocks/reports), hot takes + reactions + comments, taste signals, and the **waitlist**. Reads overlay this fallback.

- **Why:** lets features ship without requiring the operator to run SQL.
- **The cost:** it's a scaling ceiling (~10k users) and makes some queries a full replay of the log. **Apply migrations `0003`–`0006` and migrate these to real tables before scaling.** See [§8](#8-database).

---

## 4. Repo layout

The dedicated Deep Cut repository keeps the Next.js web app at its root and the
Expo client in `deep-cut-native/`.

```
.
  src/
    app/
      (tabs)/            # authed shell: Tonight (page.tsx), you, lobby, settings, m/[id], u/[key], playlists
      welcome/           # onboarding flow (required signature film)
      login/ reset/      # auth
      settle/ roll/      # standalone public modes (Settle It, Just Roll It)
      admin/             # owner console (Overview / Money / Members / Door)
      api/               # ~45 route handlers (see below)
    components/          # ~50 client components (TonightScreen, SettleFlow, HotTakesWall, SignatureShrine, ProfileTheme, AdminDashboard, WaitlistForm…)
    lib/                 # engine, ai, tmdb, obscurity, stripe, premium, waitlist, safety, spotify, email, …
  supabase/migrations/   # 0001–0006 SQL
  public/                # sw.js (service worker), offline.html, manifest
  deep-cut-native/       # Expo iOS/Android client
  vercel.json            # cron schedules
```

Key API routes: `recs` (deal), `settle/pool`, `roll/pool`, `stripe/{checkout,portal,webhook}`, `waitlist` + `admin/waitlist` + `cron/waitlist-trickle`, `takes*`, `safety`, `me`, `services`, `theme`, `onboarding`, `cron/friday-deal`.

---

## 5. Environment variables

Set in Vercel (Production). Grouped by system. **Bold = required to boot.**

**Supabase (core)**
- **`NEXT_PUBLIC_SUPABASE_URL`**, **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** — public client
- **`SUPABASE_SERVICE_ROLE_KEY`** — server-only, bypasses RLS. Never expose.

**Site**
- `NEXT_PUBLIC_APP_URL` — canonical origin (`https://thedeepcut.xyz`). Ignored if it points at a `*.vercel.app` host (see `src/lib/site.ts`).

**LLM (Groq / OpenAI-compatible)**
- **`LLM_API_KEY`** — Groq key. `LLM_BASE_URL` (default `https://api.groq.com/openai/v1`), `LLM_MODEL` (default `openai/gpt-oss-120b`), `LLM_FALLBACK_MODEL` (default `llama-3.3-70b-versatile`), `LLM_PROVIDER` (`openai-compatible` default | `anthropic`). `ANTHROPIC_API_KEY` only if provider=anthropic.

**Movie data**
- **`TMDB_API_KEY`** — required. `OMDB_API_KEY` — optional (IMDb/RT ratings; falls back to TMDB rating).

**Payments (Stripe)** — see [§9](#9-payments-stripe)
- `STRIPE_SECRET_KEY` (`sk_live_…`), `STRIPE_PRICE_ID` (monthly $3.99), `STRIPE_PRICE_ID_LIFETIME` ($150 one-time), `STRIPE_WEBHOOK_SECRET` (`whsec_…`). `BALCONY_PRICE_USD` optional display value.

**Email (Resend)**
- `RESEND_API_KEY` — used by the app directly for waitlist confirmation email. `EMAIL_FROM` (default `Deep Cut <tickets@thedeepcut.xyz>`).
- ⚠️ **Auth emails** (magic link, invite, confirm) are sent by **Supabase** using Resend as custom SMTP — configured in the **Supabase dashboard → Auth → SMTP**, *not* via these env vars. The same Resend key lives in two places.

**Push (VAPID)**
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — Friday-night deal push. Optional.

**Spotify**
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` — profile theme music. Optional.

**Cron / admin / flags**
- `CRON_SECRET` — bearer token guarding cron routes. `ADMIN_EMAILS` — comma-list of admins (default `griffin@hostfluencer.com`). `WAITLIST_DAILY` — daily auto-invites (default 25; `0` pauses). `NEXT_PUBLIC_ADSENSE_CLIENT`, `NEXT_PUBLIC_ENABLE_GOOGLE` — ad/oauth flags.

> **Security:** rotate any key ever pasted into chat/email/screenshots. Keys live in Vercel (app), Supabase (SMTP), and provider dashboards.

---

## 6. External accounts to transfer

Vercel · Supabase · Stripe · Resend · **Namecheap** (domain `thedeepcut.xyz` DNS) · Spotify Developer · TMDB · OMDb · Google Search Console · Apple Developer. Hand over owner/admin access to each.

---

## 7. Local dev & deploy

```bash
npm install
# create .env.local with the vars from §5 (get real values from Vercel)
npm run dev         # http://localhost:3000
npm run typecheck   # tsc --noEmit  (must pass)
npm run test        # vitest (obscurity tests etc.)
npm run build       # production build (must pass before deploy)
```

**Deploy:** push to `main` → Vercel auto-deploys (~60–90s). Verify live version at `https://thedeepcut.xyz/api/version` (bump the `BUILD` marker in `src/app/api/version/route.ts` when shipping). Vercel Hobby caps at 100 deploys/day and is technically non-commercial — **upgrade to Pro before real traffic/revenue.**

**Cron** (`vercel.json`): `cron/friday-deal` (Fri 23:00 UTC push) and `cron/waitlist-trickle` (daily 17:00 UTC auto-invites). Guarded by `CRON_SECRET`.

---

## 8. Database

Supabase Postgres, RLS on. Migrations in `supabase/migrations/`:

- `0001_init` — users, movies, loved_movies, watch_logs, recommendations, taste_profiles, playlists, follows, **events**, …
- `0002_metrics`, `0003_ratings`, `0004_profile_style`, `0005_premium` (premium columns + push_subscriptions), `0006_playlist_visibility`

**Action item:** confirm which migrations are actually applied to prod. The app runs on the events-table fallback where they aren't. **Apply `0003`–`0006`** (Supabase SQL editor) and plan to migrate the events-fallback features (premium, profile style, playlist visibility, safety, hot takes, **waitlist**) to real tables before scaling past a few thousand users.

---

## 9. Payments (Stripe)

- **Model:** freemium. App is free; **Balcony Seats** premium = **$3.99/mo with a 90-day trial** (`TRIAL_DAYS=90` in `src/lib/stripe.ts`) **or** a **$150 one-time lifetime** pass. 30 deals/day + ad-free vs 10/day free.
- **Flow:** `api/stripe/checkout` (subscription or one-time by `plan`) → Stripe Checkout → `api/stripe/webhook` sets `premium_until`. Billing portal via `api/stripe/portal`. Premium status read by `isPremium()` (`src/lib/premium.ts`), events-fallback aware.
- **Lifetime** = `premium_until` set to 2099 (see `LIFETIME_UNTIL`).
- ⚠️ **Gotcha already fixed, know it exists:** recent Stripe API versions moved `current_period_end` off the subscription root onto `items.data[]`. The webhook reads it defensively (`periodEndSeconds`) — if you touch subscription parsing, preserve that. The webhook **must return 200**; a throw = 500 = Stripe retries = no upgrade.
- **Duplicate cleanup:** there are duplicate live products and a duplicate webhook endpoint from setup — keep the ones whose IDs are in Vercel, archive/delete the rest. The active webhook is **Deep-cut2**.

---

## 10. Native app

The native client is an Expo app in `deep-cut-native/`. Phase 1 is implemented:
authentication, onboarding, and the Tonight recommendation flow call the existing
backend. It also has native screens for social, playlists, TV, and other product
surfaces; use the source and [`deep-cut-native/README.md`](./deep-cut-native/README.md)
as the current implementation record rather than this older handoff.

Continue feature-parity and release work from
[`RN-BUILD-PLAN.md`](./RN-BUILD-PLAN.md) and
[`deep-cut-native/LAUNCH.md`](./deep-cut-native/LAUNCH.md). Do not start a
Capacitor wrapper or duplicate the backend.

**iOS = free "reader app" (the Netflix/Spotify model):**
- **No in-app purchase UI on iOS.** Hide/disable the Balcony Seats purchase buttons on the iOS build.
- Users **subscribe on the web** (thedeepcut.xyz, existing Stripe). The app just recognizes `premium_until` when they sign in — already works.
- This keeps **100% of revenue on Stripe** (no Apple 15–30% cut) and is the **lowest App-Store-rejection risk**.
- ⚠️ Do **not** put a Stripe checkout button inside the iOS app for digital goods (violates guideline 3.1.1). External-link rules are loosening in the US (2025 ruling) — verify current guidelines before adding any "subscribe on web →" link.
- Add real native touches so it isn't "just a website" (guideline 4.2): native push, splash, app icon, haptics.

**Store preparation:** `deep-cut-native/LAUNCH.md` has the current EAS/TestFlight
steps and outstanding owner-provided items. Confirm the configured Expo SDK,
Apple Team ID, store metadata, and review requirements before building.

---

## 11. First-week priorities for the new team

1. Read this doc + `README.md`; get the app running locally (§7); confirm `typecheck`, `test`, `build` all pass.
2. Transfer/receive all accounts (§6); **rotate every secret** during handover.
3. Confirm applied migrations; apply `0003`–`0006` (§8).
4. Add **error monitoring (Sentry)** — currently none; you're flying blind on prod errors.
5. Move Vercel to **Pro** (commercial + higher limits).
6. Send the **TMDB commercial-use** email (required for a paid product using their data).
7. Continue the existing Expo client and follow its launch checklist (§10).

## 12. Known debt / watch-outs (quick list)

- Events-table fallback ceiling (~10k users) — migrate to real tables.
- No error monitoring yet (Sentry).
- Vercel Hobby (non-commercial + 100 deploys/day) → Pro.
- Obscurity scoring is load-bearing and hand-tuned — re-audit against prod after any change.
- Stripe: duplicate products/webhooks to clean up; keep the ones referenced in Vercel.
- Resend key lives in two places (Vercel + Supabase SMTP).
- TMDB commercial license email pending.

---

*Product built and shipped by the founder with AI pair-programming. Everything above reflects the live state of the app as handed off.*
