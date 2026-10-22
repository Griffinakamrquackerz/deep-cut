# Deep Cut — Developer Handoff

**App:** Deep Cut — "Movies you haven't seen yet." An AI ticket-dealer reads the films you
love, writes a taste profile, and deals nightly picks with an obscurity dial. Campy
midnight-repertory-theater design language throughout.

- **Production:** **https://thedeepcut.xyz** (cutover live — domain verified serving the app 2026-09-17; the `deepcut-beta.vercel.app` alias may still resolve, but the custom domain is canonical — see Cutover)
- **Deploy verification:** `GET /api/version` returns `{ "build": "<marker>" }` —
  bump the marker in `src/app/api/version/route.ts` on each release and verify
  it after deploys. The production endpoint reported `taste-blend-v268` when
  this handoff was checked; verify the live value before shipping.
- **Owner:** griffin@hostfluencer.com

---

## 1. Repo layout — READ THIS FIRST

Deep Cut has its own GitHub repository: `Griffinakamrquackerz/deep-cut`.
The Next.js web app and API live at the repository root; the Expo iOS/Android
client lives in `deep-cut-native/`. HostfluencerV is a separate, unrelated
project and is not part of this repository.

Vercel deploys this repository from its root. Do not configure a `deep-cut/`
subdirectory as the Vercel root.

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 App Router, TypeScript strict, React 19 | `src/app` |
| Styling | Tailwind v4 (`@theme` tokens in `globals.css`) | Camp CSS: marquee bulbs, stamps, neon, film-strip, themes |
| DB/Auth/Storage | Supabase (Postgres + RLS, magic link + password auth, `avatars` bucket) | Server uses service-role (`src/lib/supabase/admin.ts`); routes self-guard with `currentUser()` |
| LLM | Groq free tier via OpenAI-compatible fetch (`src/lib/ai.ts`) | Primary `openai/gpt-oss-120b`, auto-fallback `llama-3.3-70b-versatile` on 429; strict-JSON + Zod + one repair pass |
| Film data | TMDB (search/details/providers/discover/images/videos) | `src/lib/tmdb.ts`; **free tier is non-commercial — commercial license inquiry pending** |
| Ratings | OMDb (IMDb + RT by imdb_id), TMDB as baseline | Optional `OMDB_API_KEY` |
| Hosting | Vercel Hobby | `maxDuration = 60` is the hard function ceiling |
| Tests | Vitest — 85 tests in `tests/` | `npx vitest run`; build gate: `npx tsc --noEmit && npm run build` |

## 3. Environment variables (see `.env.example`)

`LLM_API_KEY` (Groq), `TMDB_API_KEY`, `OMDB_API_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_APP_URL`, `DAILY_REC_BATCHES`, `DAILY_PROFILE_REGENS`,
`NEXT_PUBLIC_ADSENSE_CLIENT` (unset → house ads), `NEXT_PUBLIC_ENABLE_GOOGLE` (unset → no Google button),
`STRIPE_SECRET_KEY` / `STRIPE_PRICE_ID` / `STRIPE_WEBHOOK_SECRET` (unset → premium storefront hidden),
`DAILY_REC_BATCHES_FREE` (free-tier deal cap, default 10; premium uses `DAILY_REC_BATCHES`, default 30).

> **Rotate every key at handoff** (Supabase, Groq, TMDB, OMDb). At least one Groq key was
> pasted in a chat once. Keys live in Vercel → deepcut → Settings → Environment Variables.

## 4. Database

Migrations in `supabase/migrations/` (run by hand in the Supabase SQL editor):
- `0001_init.sql` — full schema + RLS. All user-owned tables cascade from `users` →
  `auth.users`, which makes account deletion a single `auth.admin.deleteUser` call.
- `0002_metrics.sql` — analytics views.
- `0003_ratings.sql`, `0004_profile_style.sql` — **may not be applied in prod.** The app is
  deliberately migration-resilient: writes retry legacy column shapes and profile
  theme/signature + blocks/reports fall back to append-only rows in `events`
  (`src/lib/profile-style.ts`, `src/lib/safety.ts`). Applying 0003/0004 is safe and retires
  the fallbacks; blocks/reports graduating to real tables is a good early task.

## 5. Feature map (where things live)

- **Rec engine:** `src/lib/engine.ts` — LLM candidates validated against TMDB (no
  hallucinated films), SQL-unique exclusions, bottomless TMDB Discover fallback, obscurity
  calibrated to TMDB vote counts (`src/lib/obscurity.ts`), vibe dial (`src/lib/vibes.ts`),
  rate limits with refunds (`src/lib/rate-limit.ts` — errors/empty deals don't burn quota).
- **Tonight:** `src/components/TonightScreen.tsx` (deal UX, vibes, filters).
- **Taste profile:** `src/lib/ai.ts` Stage A; regenerates every 5th watch log; PNG share at
  `/api/taste-card`.
- **Crew-credit rank:** `src/lib/rank.ts` (pure) — a film-crew ladder (Office PA →
  Set PA → Key PA → 2nd 2nd AD → 2nd AD → 1st AD → Director → Executive Producer),
  crossing "above the line" at Director. Card in `ProjectionistCard.tsx`, promotion
  ceremony `RankUp.tsx` (localStorage remembers last celebrated).
- **Watch streak:** `src/lib/streak.ts` (pure) — consecutive *weeks* with a logged
  watch, computed on the `/you` page from `watch_logs`. Surfaced by `StreakBadge.tsx`.
  No stored counter, nothing to migrate.
- **Web push / Friday Night Deal** (optional, off until configured):
  - Client opt-in `NotificationsToggle.tsx` (in Settings) → subscribes via the SW
    (`public/sw.js` `push`/`notificationclick` handlers) → `POST /api/push/subscribe`
    (rows in `push_subscriptions`, migration 0005). Public key served at
    `/api/push/vapid`.
  - Weekly cron `GET /api/cron/friday-deal` (schedule in `vercel.json`, Fri 23:00 UTC)
    picks each subscriber's newest active rec and pushes it via `src/lib/push.ts`.
  - **To turn it on:** `npx web-push generate-vapid-keys`, then set `VAPID_PUBLIC_KEY`,
    `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `CRON_SECRET` in Vercel; apply migration
    0005. Until then everything no-ops and the Settings toggle stays hidden. The native
    App Store wrapper additionally needs APNs configured under your Apple Developer team.
- **Community:** `/lobby` (marquee feed + people search), profiles `/u/[handle-or-id]`
  (public, themed via `src/lib/themes.ts` CSS-var overrides, signature-film stills shrine
  `SignatureShrine.tsx`), avatars (`/api/avatar`, client-resized JPEG → Supabase storage).
- **Settle It** (two-player standoff): `/settle`, engine `src/lib/settle.ts` (spec'd scoring
  — see comments), real-data pool `/api/settle/pool`, per-film enrichment (trailer/ratings/
  streaming) `/api/settle/film`, autoplay trailer `VerdictMedia.tsx`, best-of-3, share.
- **Growth:** landing page (`Landing.tsx`, signed-out `/`), Letterboxd import
  (`/api/import/letterboxd` + `src/lib/letterboxd.ts` CSV parser), invite (`InviteButton`),
  PWA (manifest + `public/sw.js` v2 — bump its cache names when changing caching).
- **Safety/App Store:** account deletion `/api/account` + Settings danger zone; block/report
  `/api/safety` + `SafetyActions.tsx` (blocks filter feed + people); `/terms`, `/privacy`.
- **Ads:** `AdSlot.tsx` — env-gated AdSense with house-ad fallback; `/ads.txt` route; hidden
  everywhere for premium members.
- **Premium ("Balcony Seats"):** $4.99/mo after a 90-day trial via Stripe — `src/lib/stripe.ts`
  (raw REST, no SDK; hand-rolled webhook signature verification), `src/lib/premium.ts`
  (users.premium_until with events fallback pre-0005), routes `/api/stripe/{checkout,webhook,portal}`,
  storefront in Settings. Free = 10 deals/day + ads; premium = 30 deals/day, ad-free. Stripe
  setup: create product/price, add the three env vars, point a webhook at
  `/api/stripe/webhook` with events `checkout.session.completed`,
  `customer.subscription.updated`, `customer.subscription.deleted`.

## 6. Known constraints & capacity

- **Email:** Supabase built-in SMTP ≈ 2–4 emails/hour → **~50 signups/day ceiling.** Brevo
  SMTP setup is the pending fix (free tier 300/day).
- **Groq free tier:** ~1k requests/day/model → LLM-flavored deals for ~400–500 DAU; beyond
  that deals degrade gracefully to Discover "vault pulls" (app keeps working).
- **Supabase free:** pauses after ~1 week idle; ~$25/mo Pro at launch. Vercel Hobby is
  non-commercial — Pro ($20/mo) once ads/App Store are real.
- Movie pages fetch trailers per view; Settle pool is 2 TMDB discover pages per game.

## 7. Cutover to thedeepcut.xyz (in progress)

1. Vercel → deepcut → Settings → Domains: `thedeepcut.xyz` added — wait for green check
   (DNS was still propagating at handoff).
2. Vercel env: set `NEXT_PUBLIC_APP_URL=https://thedeepcut.xyz`, redeploy.
3. Supabase → Authentication → URL Configuration: Site URL `https://thedeepcut.xyz`;
   add `https://thedeepcut.xyz/auth/callback` (keep the vercel.app ones during transition).
4. Share links all use `window.location.origin` — no code changes needed.
5. AdSense (later): apply with thedeepcut.xyz, set `NEXT_PUBLIC_ADSENSE_CLIENT`.

## 8. Native app and store roadmap

The iOS/Android client is an Expo app in `deep-cut-native/`, not a Capacitor
wrapper. Authentication, onboarding, Tonight, social, TV, and participation
surfaces are present; continue checking native/web feature parity against the
current source. Follow `deep-cut-native/LAUNCH.md` for EAS, TestFlight, and
store-specific tasks. Confirm current Apple account, listing, privacy, and
commercial-use requirements before release; this document's former Capacitor
checklist is obsolete.

## 9. Working conventions

- Every release: tests + `tsc --noEmit` + `npm run build` locally, bump `/api/version`
  marker, merge to `main`, verify the marker live before calling it shipped.
- Never fail silently: DB writes check errors (see `cacheMovie` in `tmdb.ts` for the
  resilient-upsert pattern), UI surfaces server error details, quota refunds on failure.
- The camp is a feature. Copy speaks in the house voice ("the projector jammed", "leave the
  theater"). Animations are compositor-only (opacity/transform); everything respects
  `prefers-reduced-motion`; touch devices get static grain. Keep it that way — the iPhone
  perf work depends on it.
