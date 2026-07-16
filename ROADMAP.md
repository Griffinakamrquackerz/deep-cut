# Deep Cut — Roadmap

North star: **the taste profile is the product.** Every feature must sharpen the profile or express it.

## Fast follows (post-MVP)

1. **Letterboxd history import** — the best acquisition wedge we have. A CSV export
   (diary + ratings) seeds `loved_movies` + `watch_logs` in one shot and produces a
   dramatically sharper first taste card. Map ★★★★+ → loved, ★★–★★★ → fine, ≤★½ → not_for_me.
2. **Taste card v2** — per-thread example films on the card; OG-image variants for link unfurls.
3. **Playlist reciprocity** — "send one back" prompt after a recipient finishes a tape.
4. **Obscurity dial as a true range** — two-thumb slider (currently min-depth dial).
5. **Watch provider deep links** — tap a service badge → open the film in that app.
6. **Weekly provider refresh job** — currently lazy (7-day TTL on read); move to a cron
   (Vercel cron or Supabase scheduled function) sweeping `movies.providers_refreshed_at`.
7. **Prompt tuning off ai_logs** — first 100 users' raw Claude outputs are logged;
   review hallucination-drop rate (Stage B validation failures) and tune buckets/prompts.

## Explicitly out of scope for MVP (per spec)

- Ads
- Long-form publishing (external links on film pages only)
- Comments on takes
- DMs
- Native iOS/Android (PWA is fine)
- Ratings out of 5/10 (reactions only: loved / fine / not for me / loved it ironically)

## Metrics that decide everything (live in `supabase/migrations/0002_metrics.sql`)

- Onboarding completion (`metric_onboarding`)
- Rec → watchlist rate, rec → seen rate, reason tap-through (`metric_rec_funnel`)
- Playlist shares + cross-offs, taste card shares (`metric_shares`)
- D7 retention (`metric_d7_retention`)
