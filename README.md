# Deep Cut

**Movies you haven't met yet.** A movie recommendation app built around a *taste
profile*, not genre filters. Users pick 10–20 films they love; Claude articulates
their taste as plain-English "taste threads"; recs bias toward lesser-known films,
each with a one-line reason tied to the profile, badged by the user's streaming
services. Playlists are movie mixtapes; the Lobby is a short-take feed; the taste
card is a shareable ticket-stub PNG.

Built per `DEEP-CUT-SPEC` — milestones M1–M6, one commit each.

## Stack

- **Next.js 15** (App Router) · TypeScript strict · Tailwind v4 — mobile-first at 390px
- **Supabase** — Postgres + Auth (magic link + Google OAuth) + RLS
- **Anthropic API** (`claude-sonnet-4-6`) — Stage A taste profiles, Stage B rec candidates.
  Server-side only; all calls behind `src/lib/ai.ts`; strict JSON validated with Zod + one repair pass
- **TMDB** — metadata/search/posters/watch-providers, cached into the `movies` table,
  all behind `src/lib/tmdb.ts`. Every Claude candidate is validated against TMDB
  (fuzzy title+year); unresolvable candidates are dropped
- **next/og** — server-rendered taste-card PNG
- **Vercel** — deploy with **Root Directory = `deep-cut`**

## Setup

1. `npm install`
2. Create a Supabase project; run `supabase/migrations/0001_init.sql` then
   `0002_metrics.sql` in the SQL editor (or `supabase db push`).
3. Enable Email (magic link) and Google providers in Supabase Auth; add
   `http://localhost:3000/auth/callback` to the redirect allowlist.
4. Get a TMDB API key (v3 key or v4 read token both work): https://developer.themoviedb.org
5. `cp .env.example .env.local` and fill in the keys.
6. `npm run dev`

## Scripts

- `npm run dev` / `build` / `start`
- `npm test` — vitest smoke tests per milestone (no network needed)
- `npm run typecheck`

## Architecture notes

- **The rec engine** (`src/lib/engine.ts`): exclusions (loved ∪ logs ∪ prior recs)
  are enforced in SQL via `unique(user_id, movie_id)`, not just in the prompt.
  Obscurity 1–5 is computed from real TMDB `vote_count` buckets at validation time.
  Fewer than 8 survivors triggers exactly one supplemental Claude batch.
- **Rate limits** (MVP): 1 profile regen + 3 rec batches per user per day
  (`usage_counters`).
- **Watchlist** is `recommendations.status = 'watchlisted'`; direct saves (movie
  page, lobby) insert batch-0 rows so one list powers everything.
- **Share slugs** are capabilities: 12 chars of CSPRNG base36; `/p/[slug]` is
  viewable logged-out, crossing off prompts signup (the acquisition loop).
- **Raw Claude outputs** are logged to `ai_logs` for prompt tuning on early users.
- **Feed** is derived by query (no feed table) — see `src/app/api/takes/route.ts`.

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB.
Streaming availability data comes from JustWatch via TMDB — display requirements
apply (attribution shown on movie pages). Review both ToS before launch.
