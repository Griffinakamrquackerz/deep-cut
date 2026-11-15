# Redesign handoff — pick up here

A working note for whoever (or whichever session) continues the Deep Cut
redesign. It is not product documentation; delete it when the work is done.

**Branch:** `claude/happy-wozniak-fg67ng` (pushed, no PR opened — the owner
has not asked for one). `main` is untouched at `da177d6`.

**State when this was written:** everything below marked *done* is committed
and pushed. Web typecheck, the 488-test suite and `next build` all pass. One
piece of work is mid-flight: the native port of "the rooms" (see §4).

---

## 1. What the owner asked for, in order

1. A full facelift of the web home page: indie-film aesthetic, a projector
   projecting the headline, and copy that says Deep Cut is **two things at
   once** — a film-finding service *and* an indie streaming house whose
   members vote (with points earned by supporting it) on which original gets
   made — built **by a filmmaker for cinephiles and filmmakers**.
2. Then the whole web app, every page, in the same look.
3. Then "make it an experience": more campy film culture; they loved the
   **movie-credits look**.
4. Then the native Expo app (`deep-cut-native/`) too.
5. Then a copy audit: **no corny lines, and it must not sound like AI or
   algorithms** — "use film and dry jargon".
6. Latest: "up the campiness, an even more complete revamp, **especially the
   actual platform**" (the signed-in app), plus: *"the 'may contain subtitles'
   line is half-assed and silly"* — fix lines like that wherever they are.

## 2. The rules that came out of that (treat as requirements)

**Copy**
- **The camp is in the objects, never in the copy.** A brass plate says
  "BOX OFFICE". A ratings band, a credit roll, a membership card are funny as
  *forms*; the words inside them are plain and true. A second joke inside the
  form is what the owner calls corny. No puns, no "no X were harmed", no
  jokey fine print, no meme phrasing, no fire/nitrate/match riffs.
- **No AI/tech language in user-facing copy**: not "recommendation engine",
  "algorithm", "AI", "in plain English". Use rep-cinema words: the house
  *programs*, a *bill*, *repertory programming*, a *programmer's note*, a
  *print*, a *splice*.
- **Exception, on purpose:** `src/app/(legal)/privacy/page.tsx` keeps "AI
  model" and names Groq. That is a data-processing disclosure, not voice.
  Do not soften it.
- Do not *claim* there is no algorithm either (an earlier "no algorithm" line
  was removed for being untrue — recommendations are model-generated).
- **Fund vocabulary is legal, not stylistic** (see `src/lib/fund.ts`,
  `FundBar.tsx`, `perks.ts`): members *support*, earn *points*, points are
  *votes*, backers get a *credit*. Never invest / equity / share / stake /
  returns / stock.
- Numbers come from code, never typed: `sharePct()`, `goalCents()`,
  `pointCap()`, `CHANNELS.length`, `PERKS`.
- The founder's note (`FounderNote.tsx`) is Griffin's own words. Present it,
  don't rewrite it.
- The obscurity dial really runs **3–5: niche / obscure / deep cut**, with a
  hard floor in `/api/recs`. Never describe it as including crowd-pleasers.

**Behaviour that must survive any restyle**
- `data-usher="…"` attributes and the refs the studio tour measures.
- Tonight's order and density: marquee → Now Showing → three games (a small
  rail, not doors) → controls collapsed to one line → films. Comments in
  `TonightScreen.tsx` explain why; keep it.
- `/submit?from=app` must render with **no onward links** (`<SiteShell quiet>`)
  — App Store guideline 3.1.1; see the note in `src/app/submit/page.tsx`.
- `/fund`, `/vote`, legal pages stay statically prerendered (that's why the
  nav's signed-in swap is client-side in `NavAuth.tsx`).
- Profile themes (`.pt-*`, `profilePalette`) re-tint amber/ticket/avail;
  the membership card and member name must keep reading those tokens.
- Everything animated respects `prefers-reduced-motion` / `useReducedMotion`.

**Process**
- Commit and push to the branch above only. No PR unless asked.
- `deep-cut-native/AGENTS.md` says to read the Expo docs first. It names SDK
  54; the app is on **SDK 57** (`expo ~57`, `react-native-reanimated 4.5.1`).
  Both were read. Stick to APIs already used in the codebase.
- Don't add native modules casually (e.g. `react-native-svg` is **not**
  installed — that's why native has no laurels or drawn tab icons).

## 3. What exists now (all committed)

### Web — design layers
| File | What it is |
|---|---|
| `src/app/globals.css` | The house style: `.slate`, `.title-card` (+ `<em>` for the amber word), `.serif-it`, `.rack-in`, film-strip `.app-frame` on ≥768px, italics → Instrument Serif, surface/button lift rules. |
| `src/app/house.css` | Set-pieces: `.rating-band`, `.credit-roll`, `.billing`, `.snipe`, `.shelf-talker`, `.vhs` + `.tape-face`, `.reel-end`, `.frame-slip`, booth cards (`.card-page`, `.film-burn`). |
| `src/app/platform.css` | The rooms: `.mq` marquee, `.bo` box office, `.door-plate`, `.rental` / `.vhs-case` / `.case-sticker` / `.genre-dot` / `.stamp-btn` / `.rental-shelf`, `.laurel`, `.showcase`, `.member-card`, `.punch`, `.felt`, `.cork` / `.pinned`, `.booth` (dymo labels + screws), `.menu-board`, `.paper-sheet`, `.tape-write`, `.app-form`, `.pedigree`. |
| `src/components/landing/landing.css` | The public site (`.lp-*`), incl. page hero, doorway, legal. |
| `src/components/house/*` | `RatingBand`, `CreditRoll`, `Snipe`, `ReelEnd`, `MarqueeBoard`, `Laurel` (+ `Sprig`), `TabIcons`, `ApplicationStrip`. |
| `src/components/site/*` | `SiteShell` (+ `PageHero`, `Slate`), `SiteNav`, `NavAuth`, `SiteCredits`, `Doorway`. |
| `src/components/landing/*` | `ProjectorHero` (measured beam, dust, leader countdown, motor sound), `LandingFX`, `DealDemo`. |
| `src/lib/tape.ts`, `member-no.ts`, `genre-dots.ts` | Stripe colour per tape, card number per member, video-store genre colours. |

### Web — screens
- **Landing** (`Landing.tsx`): projector hero → ticker → green band → double
  feature (The Deal / The Greenlight) → how a film gets made (5 frames + live
  fund bar) → playable ballot → Theatre channel guide → house picks → founder's
  note as a director's statement → two doors → Q&A → last call → rolling credits.
- **Public pages**: `/fund` (incl. concession-board perks + credit roll),
  `/vote`, `/submit`, legal, and the doorways `/login`, `/reset`, `/seated`,
  `/unsubscribe`.
- **Platform**: Tonight (marquee, box office, door plates, rental shelf,
  green band with factual fine print), film page (display case + laurels +
  billing block), Community (felt letterboard, takes pinned to cork), You
  (membership card, punch card, credit roll, tapes), Settings (booth panel),
  Mixtapes (VHS spines, cassette face, write-on label), onboarding (one
  membership application in four parts, stamped APPROVED), comment card for
  logging a film, drawn tab-bar icons, 404 "Reel missing", error "The film
  broke", splice between tabs, "End of reel" footer.

### Native (`deep-cut-native/`)
- Done and wired: theme tokens (`ink`, `light`, `paper*`, `fonts.serif`),
  Instrument Serif loaded in `_layout.tsx`, `Marquee` is projected light with
  an `accent` word, `Slate` headers everywhere, and `components/house.tsx`:
  `Slate`, `TitleCard`, `RatingBand`, `ShelfTalker`, `Tape`, `CassetteFace`,
  `CreditRoll`, `BillingBlock`, `Snipe`, `ReelEnd`, `BoothCard`;
  `+not-found.tsx`; `ErrorBoundary` exported from the root layout.
- Copy mirrors the web word for word where the same card exists.

## 4. In flight — do this first

**`deep-cut-native/src/components/rooms.tsx` is written, typechecks, and is
not imported anywhere yet.** It is the native port of `platform.css`:

`MarqueeBoard`, `BoxOffice`, `Grille`, `VhsCase`, `CaseSticker`, `GenreDots`,
`StampButton`, `ShelfLip`, `MemberCard`, `memberNo`, `PunchCard`, `FeltBoard`,
`Cork`, `Pinned`, `PaperHead`, `ApplicationStrip`, `Dymo`, `BoothPlate`.

Wire it in, screen by screen, matching what the web now does:

| Native file | Change |
|---|---|
| `src/app/(tabs)/tonight.tsx` | Replace `<Slate>Tonight</Slate>` + `<Marquee>` with `<MarqueeBoard title="Movies you haven't seen yet" red="haven't seen" />`. Wrap the `wantCard` controls in `<BoxOffice glass={…tuner + expanded controls…}>{deal button}</BoxOffice>` with `<Grille />` beside the summary. Restyle the three `styles.chip` Pressables as door plates (keep their refs — the tour measures them): drop the emoji, Bebas label, the "★ GRIFF'S FAVORITE" badge stays. |
| `src/components/RecCard.tsx` | Poster inside `<VhsCase>`; gem label as `<CaseSticker>` instead of `styles.stamp`; add `<GenreDots genres={m.genres} />` (and stop passing genres to `RatingLine` if that duplicates them); replace the three `Button`s with `<StampButton>` (amber/cream/dim, tilts −1.2 / 0.8 / −0.6, flex 1.25 / 1 / 0.95); `<ShelfLip />` as the card's last child, with the card's bottom padding removed. |
| `src/components/ProfileScreen.tsx` | Replace the header row (avatar + name + handle + follows + action) with `<MemberCard id name handle accent={palette.amber} photo={<Avatar…/>} action={…} footnote={"N followers · following N · not transferable"} />`. |
| `src/components/ProjectionistCard.tsx` | Replace the `track`/`fill` bar with `<PunchCard progress={stats.progress} note={"next: … at N reels"} />`. |
| `src/app/(tabs)/community.tsx` | Replace `styles.viewChips` with `<FeltBoard items=[{feed,"Marquee","who's watching"},{takes,"Takes","the wall"},{people,"People","find them"},{inbox,"Inbox","for you"}] value={view} onChange={…} badges={{ inbox: unread }} />` — keep whatever the current `onPress` does (it clears unread on inbox). |
| `src/components/TakesWall.tsx` | Wrap the list in `<Cork>` and each take in `<Pinned index={i}>`. Text inside must switch to `colors.paperInk` / `colors.paperDim` — the cards are cream. |
| `src/app/(tabs)/settings.tsx` | Section `<Eyebrow>`s → `<Dymo>` (`tone="red"` where the eyebrow was ticket-coloured, `"amber"` where amber); bordered section cards → `<BoothPlate>`. |
| `src/components/ReactionSheet.tsx` | Sheet background `colors.paper`, `<PaperHead left="Comment card" right="You watched" />`, text in paper ink. |
| `src/app/(tabs)/mixtapes.tsx` (create view) | Name + recipient inputs sit on a cassette label (see web `.tape-face` / `.tape-write`; `CassetteFace` in `house.tsx` is the read-only version to copy the look from). Placeholder: "Name this tape…". |
| `src/app/onboarding.tsx` | `<Eyebrow>Take N of 4 · …</Eyebrow>` → `<ApplicationStrip part={N} />`. |
| `src/app/m/[id].tsx` | Optional: poster in a lit "NOW SHOWING" frame (plain Views; no laurels without SVG) + `<GenreDots>`. |

Then verify (recipe in §6), commit, push.

## 5. After that — ideas not started

Owner's last ask was "I think we can do more", weighted to the platform.
Candidates, roughly by value:

- **Community feed items** as lobby cards (web `LobbyScreen.tsx` still uses
  plain `.film-card` rows).
- **Inbox** ("your pigeonhole") as mail slots / telegrams (`Inbox.tsx`).
- **Film page actions** (`MovieActions.tsx`) as stamps; **You** poster grids
  as a contact sheet with frame numbers.
- **Settle It / Just Roll It / This Meets That** interiors — only their
  headers and loading lines were touched.
- **The Theatre** (`/tv`) is already the richest screen; left alone.
- A real-device pass on native (see §7).
- Existing copy that predates this work was mostly left alone when it read
  dry (crew-rank ladder, vibe chips, "pull up a beanbag"). The owner has not
  ruled on those; ask before rewriting them wholesale.

## 6. How to preview and verify

There are no real credentials in a cloud session, so previews run against
stand-ins. None of this tooling is in the repo (it lived in a scratch dir);
rebuild it as needed:

1. **Mock Supabase** — a tiny Node HTTP server on `127.0.0.1:54399` answering
   `/auth/v1/settings` (`{disable_signup:true|false}`), `/auth/v1/user`
   (a user when an `Authorization: Bearer` header is present), and
   `/rest/v1/<table>` from in-memory "fat" rows (nested relations inlined;
   apply `col=eq.x` / `col=in.(…)` only to columns a row has; honour `limit`,
   HEAD + `Content-Range`, and `Accept: application/vnd.pgrst.object+json`).
   Tables that matter: `movies`, `users`, `user_services`, `loved_movies`,
   `taste_profiles`, `recommendations`, `watch_logs`, `playlists`
   (+`playlist_items`), `follows`, `shorts`, `events` (`hot_take`,
   `take_reaction`), `fund_contributions`.
2. **`.env.local`** (gitignored — delete it afterwards):
   `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399`, any anon/service key,
   `TMDB_API_KEY=preview`, `ADMIN_EMAILS=member@example.com`.
3. **TMDB** — `NODE_OPTIONS="--require ./preload.cjs" npx next dev`, where the
   preload wraps `globalThis.fetch` and answers `api.themoviedb.org/3/*`
   (search, movie, credits, discover) from fixtures. Real poster paths can be
   scraped from themoviedb.org search pages with curl.
4. **Signed-in pages** — set cookie `sb-127-auth-token` =
   `"base64-" + base64url(JSON session)` (fake JWT, `expires_at` in the
   future, a `user`). Also set `localStorage.dc_studio_tour_optout = "1"` or
   the studio tour takes over the screen.
5. **Screenshots** — Playwright + Chromium are preinstalled; mobile 390×844,
   desktop 1440×900. Hide the dev badge with
   `nextjs-portal{display:none!important}`.
6. **Native** — `cd deep-cut-native && npm ci`, then a *temporary, untracked*
   `app.config.js` overriding `extra` (`apiBaseUrl: ""`, the mock Supabase
   URL), `npx expo export -p web --output-dir <dir>`, serve that dir with a
   small server that proxies `/api/*` to the Next dev server, and put the
   same session JSON in `localStorage["sb-127-auth-token"]`. **Delete
   `app.config.js` before committing** — `app.json` points at production.

Checks before every commit:
```
npx tsc --noEmit && npx vitest run          # web: 57 files / 486 tests pass
NEXT_TELEMETRY_DISABLED=1 npx next build    # stop `next dev` first; rm -rf .next after
(cd deep-cut-native && npx tsc --noEmit)    # exactly ONE known error, below
```

## 7. Known issues / honest gaps

- `deep-cut-native/src/app/settle.tsx(73)`: `obscurity` typed `0|2|4` against
  `2|3|4`. Pre-existing, untouched, the only native type error.
- `tests/mentions-parity.test.ts` fails if `deep-cut-native/node_modules` is
  missing (it needs Expo's tsconfig). Run `npm ci` there and it passes.
- Native has only ever been seen through the **web export** against mock
  data. Fonts, shadows, `transformOrigin`, and animation timing on a real
  iPhone/Android are unverified.
- Native tab bar still uses emoji; web's are drawn SVGs (`TabIcons.tsx`).
- The live site (thedeepcut.xyz) has lagged the branch — the owner has sent
  screenshots of copy that was already fixed. Check the branch before
  "fixing" something from a screenshot.
- `SettingsScreen.tsx` contains two different monthly prices ($4.99 in a
  comment, $3.99 on the button). Not touched; no price is quoted in new copy.
