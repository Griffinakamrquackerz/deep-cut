# Deep Cut — React Native Build Plan

> **STATUS:** The Expo client lives at **`./deep-cut-native/`** (Expo SDK 57,
> expo-router, TypeScript). Auth, onboarding, Tonight, and several social, TV,
> and participation screens are implemented against the live backend. Further
> parity and store-readiness work remains; see `deep-cut-native/README.md` and
> `deep-cut-native/LAUNCH.md` for the current client and release checklist.

A spec for rebuilding the **Deep Cut** front end as a native **React Native (Expo)** app, reusing the existing backend. Read [`HANDOFF.md`](./HANDOFF.md) first for the full product/architecture context.

> **Core principle:** Rebuild **only the UI**. The recommendation engine, obscurity scoring, LLM, TMDB, Stripe, and all data logic **stay exactly where they are** in the deployed Next.js app. The RN app is a *new client* that calls the same backend. Do **not** re-implement `src/lib/*` in RN.

---

## 1. Target architecture

```
┌─────────────────────────┐        ┌──────────────────────────────────┐
│  React Native app (Expo)│        │  EXISTING Next.js app (unchanged) │
│  - all screens/UI        │ HTTPS  │  - /api/* route handlers          │
│  - navigation, animation │◄──────►│  - engine/obscurity/LLM/TMDB      │
│  - Supabase client (auth)│        │  - Stripe checkout/portal/webhook │
└─────────────────────────┘        └──────────────────────────────────┘
            │                                   │
            └───────────────┬───────────────────┘
                            ▼
                    Supabase (Postgres + Auth + Storage)
```

- Keep the Next.js app deployed at `thedeepcut.xyz` — it's the **API + the web version + the payment surface**.
- The RN app talks to: **Supabase directly** (auth, some reads) and the **Next.js `/api/*` endpoints** (everything LLM/TMDB/Stripe-heavy).
- **Set an API base URL** in the RN app config (`https://thedeepcut.xyz`). All `fetch` calls hit `${API_BASE}/api/...`.
- **Auth cookies vs tokens:** the web app auths via Supabase cookies. In RN, use the **Supabase JS client with a Bearer token** and send `Authorization: Bearer <access_token>` to the API routes. ⚠️ The existing route handlers read the session from cookies via `currentUser()` — they'll need a small tweak to *also* accept a Bearer token (see §7).

---

## 2. Recommended stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **Expo (managed)** + **EAS Build** | Fastest RN path; handles iOS/Android builds, OTA updates, push |
| Navigation | **expo-router** | File-based routing — mirrors Next.js mental model |
| Styling | **NativeWind** | Tailwind syntax in RN → port existing classes with minimal translation |
| Animation | **react-native-reanimated** (+ **moti**) | Rebuild the camp motion (marquee bulbs, turntable spin, ceremonies) |
| Auth/data | **@supabase/supabase-js** + **expo-secure-store** | Native session storage; magic-link via deep links |
| Lists | **@shopify/flash-list** | Perf for feeds/poster grids |
| Trailers/video | **react-native-webview** or **react-native-youtube-iframe** | Roll/movie trailers are YouTube |
| Spotify theme | **react-native-webview** (Spotify embed) | Simplest faithful port of the turntable's licensed player |
| Sound FX | **expo-av** | Replaces `src/lib/sfx.ts` (Web Audio) |
| Haptics | **expo-haptics** | Replaces web haptics |
| Push | **expo-notifications** | Replaces the web-push/VAPID path |
| Sharing | **expo-sharing** / **expo-clipboard** | Share taste cards / playlist links |
| Payments | **Reader-app model — no IAP** | See §6 |

Avoid bare RN. Use Expo.

---

## 3. What carries over vs. gets rebuilt

**Reuse untouched (server-side):** the entire recommendation engine, honest-obscurity scoring, LLM pipeline, TMDB/OMDb clients, Stripe checkout/portal/webhook, waitlist logic, safety, rate limiting — everything in `src/lib/*` and `/api/*`.

**Rebuild in RN:** every screen and component. Map below.

**Replace (web-only tech has native equivalents):**
| Web thing | RN equivalent |
|---|---|
| Next.js pages / RSC | expo-router screens (client-fetched) |
| Tailwind classes | NativeWind classes |
| CSS keyframe animations (`globals.css`) | Reanimated / Moti |
| Web Audio (`sfx.ts`) | expo-av |
| Service worker / PWA / offline.html | native app + expo-updates (N/A concept) |
| `<img>` from TMDB | `expo-image` (caching built in) |
| Web push (VAPID) | expo-notifications |
| Server-rendered share PNG (`/api/taste-card`) | keep the endpoint; display/share the image natively |

---

## 4. Screen map (web → RN)

Bottom tab bar (expo-router `(tabs)`): **Mixtapes · Community · Tonight (center) · You · Settings**

| RN screen | From (web) | Primary data / API |
|---|---|---|
| **Tonight / Deal** | `(tabs)/page.tsx` + `TonightScreen` | `GET/POST /api/recs`, `PATCH /api/recs/[id]`, `POST /api/logs` |
| **Onboarding** | `welcome/` + `OnboardingFlow` | `POST /api/onboarding`, `/api/search`, `/api/me` |
| **Settle It** | `settle/` + `SettleFlow` | `POST /api/settle/pool`, `GET /api/settle/film` |
| **Just Roll It** | `roll/` + `RollChannel` | `POST /api/roll/pool`, `GET /api/settle/film` (trailers) |
| **You (profile)** | `(tabs)/you` + `ProfileView`/`YouScreen` | Supabase reads, `/api/me`, `/api/loved`, `/api/services` |
| **Public profile** | `(tabs)/u/[key]` + `ProfileView` | Supabase reads, `/api/theme` |
| **Movie detail** | `(tabs)/m/[id]` | Supabase movie + `HotTakesWall` |
| **Community** | `(tabs)/lobby` + `LobbyScreen`/`HotTakesWall` | `/api/feed`, `/api/people`, `/api/takes*`, `/api/follows` |
| **Mixtapes** | `(tabs)/playlists` + `[id]` | `/api/playlists`, `/api/playlists/items/[id]` |
| **Settings** | `(tabs)/settings` + `SettingsScreen` | `/api/services`, `/api/me`, Stripe (web), `/api/theme` |
| **Auth** | `login/`, `reset/` | Supabase auth (magic link + password) |

**Admin console** (`admin/` + `AdminDashboard`): **skip in RN.** Keep it web-only — the founder uses it in a browser. Saves real effort.

---

## 5. Design system port

- **Fonts:** load the display + mono faces via `expo-font` (match `globals.css`).
- **Colors:** port the `@theme` tokens (amber, ticket-red, cream, bg, surface, dim) into a NativeWind theme config.
- **Signature motion to rebuild with Reanimated:** marquee bulb chase, projector flicker, the shrine crossfade, the turntable vinyl spin + tonearm, rank-up/verdict ceremonies, confetti (use `react-native-confetti-cannon` or Reanimated). Respect reduced-motion (`AccessibilityInfo.isReduceMotionEnabled`).
- Keep the deadpan camp voice in all copy — it's the brand.

---

## 6. Payments (reader-app model — keep Stripe, no Apple cut)

Do **not** build in-app purchases. On iOS, Apple would take 15–30% of digital subs.

- The RN app **has no purchase UI** for Balcony Seats.
- Users **subscribe on the web** (`thedeepcut.xyz`, existing Stripe). Open it in the system browser (`expo-web-browser`) if you add a "Manage membership on the web →" link — verify current App Store external-link rules first (loosening in the US as of 2025).
- The RN app just **reads `premium_until`** (via `/api/me` or Supabase) and unlocks features. This already exists server-side (`isPremium`), so it "just works."
- This keeps 100% of revenue on Stripe **and** is the lowest App-Store-rejection path.

> If you ever decide you want in-app purchases anyway, use **RevenueCat** — but that's a business decision to hand Apple a cut, not a technical requirement.

---

## 7. Backend changes needed for RN (small but required)

The `/api/*` routes currently authenticate via Supabase **cookies** (`currentUser()` in `src/lib/supabase/server.ts`). RN sends a **Bearer token** instead. Make the server accept both:

1. In the auth helper, if there's no cookie session, read `Authorization: Bearer <token>` and validate it with `supabase.auth.getUser(token)`.
2. Enable CORS on `/api/*` for the app (or serve the API from the same domain — simplest is to allow the app's origin).
3. Deep-link config for magic-link auth: set the Supabase redirect URL to the app's scheme (`deepcut://auth/callback`) in addition to the web callback.

Everything else (RLS, service-role writes, business logic) is unchanged.

---

## 8. Phased milestones (ship something early)

1. **Phase 1 — Skeleton + one loop:** Expo + expo-router + NativeWind, Supabase auth (magic link via deep link), onboarding, and the **Tonight/Deal** screen calling `/api/recs`. Prove one full loop natively.
2. **Phase 2 — Public modes:** Settle It + Just Roll It (clean public APIs, no auth needed).
3. **Phase 3 — Social/profile:** You tab, public profiles + shrine + theme player (WebView), movie detail, Hot Takes, feed, follows.
4. **Phase 4 — Mixtapes + polish:** playlists, push (expo-notifications), the full camp animation pass, reduced-motion.
5. **Payments:** reader-app model throughout (web Stripe) — nothing to build in-app.
6. **Ship:** EAS Build → TestFlight → App Store; Play Store in parallel.

**Realistic effort to feature parity: ~2–4 months** for a small team. Backend reuse is what keeps it out of 6-month territory.

---

## 9. Gotchas / notes for the builder

- **Don't reimplement the engine or obscurity scoring** — call the APIs. That logic is hand-tuned and load-bearing; forking it into RN will drift and regress.
- **Obscurity/genre tuning lives server-side** → the RN app inherits all of it for free.
- **Spotify + trailers** are the two "web-native" bits — both handled via WebView; budget a little time for the turntable to feel right.
- **Events-table tech debt** (see HANDOFF §3/§8) is server-side and unaffected by the RN work, but still worth migrating before scale.
- **No error monitoring yet** — add Sentry (RN SDK) in the app *and* keep/add it on the backend.
- **Config the RN app needs:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `API_BASE_URL` (`https://thedeepcut.xyz`). No server secrets ever ship in the app bundle.

---

*The web app is the source of truth and stays live. The RN app is a native client on top of the same brain — build the face, reuse the engine.*
