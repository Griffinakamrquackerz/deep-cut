# Redesign handoff — pick up here

A working note for whoever (or whichever session) continues the Deep Cut
redesign. It is not product documentation; delete it when the work is done.

**Branch:** `claude/continue-previous-work-sh53go` (pushed, no PR opened —
the owner has not asked for one). `main` is untouched at `da177d6`.

The redesign line (`claude/happy-wozniak-fg67ng`) and a parallel line of
fund/premium work had diverged at `196c8df`; `16e3024` merged them, and this
branch now carries both. Work here, not on happy-wozniak.

**State when this was written:** everything below marked *done* is committed
and pushed, and nothing is mid-flight. Web typecheck, the 519-test suite and
`next build` all pass; native typecheck is down to the one known pre-existing
error in §7.

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

7. Then an audit of the front page: *"way too much noise / text that people
   won't read"*. Condense it, send the long version to its own page, and
   make sure a visitor knows what Deep Cut is **in 15 seconds or less**.

8. Then the inside of the app: *"a lot of the old look... most of it is out of
   date"* — upgrade it, the movie deal area and the Theatre especially, and
   make the remote look cleaner.

## 2. The rules that came out of that (treat as requirements)

**Copy**
- **The camp is in the objects, never in the copy.** A brass plate says
  "BOX OFFICE". A ratings band, a credit roll, a membership card are funny as
  *forms*; the words inside them are plain and true. A second joke inside the
  form is what the owner calls corny. No puns, no "no X were harmed", no
  jokey fine print, no meme phrasing, no fire/nitrate/match riffs.
- **The front page says each thing once.** It ran to 2,187 words because four
  facts (the fund's share, $1 = 1 vote, every pitch read, credits for
  backers) were restated in eight sections. The wall carries the whole pitch
  — headline plus one sentence under each half — and everything below is
  evidence for it. If a section on `Landing.tsx` wants a second paragraph,
  it goes to `/deal`, `/fund`, `/vote` or `/about` behind a `.lp-more` link.
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
  don't rewrite it. The front page shows its opening (`<FounderNote excerpt />`,
  the first three paragraphs untouched); `/about` shows all of it.
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
| `src/app/platform.css` | The rooms: `.mq` marquee, `.bo` box office, `.door-plate`, `.rental` / `.vhs-case` / `.case-sticker` / `.genre-dot` / `.stamp-btn` / `.rental-shelf`, `.laurel`, `.showcase`, `.member-card`, `.punch`, `.felt`, `.cork` / `.pinned`, `.booth` (dymo labels + screws), `.menu-board`, `.paper-sheet`, `.tape-write`, `.app-form`, `.pedigree`, lobby cards (`.lobby-card`/`.lc-*`), the pigeonhole (`.pigeon`, `.memo*`), `.contact` sheets, and the three doors' interiors: `.set` + `.tuner` (Roll), `.bench` / `.strip` / `.splice-join` / `.spliced` (Blend), `.docket` / `.stamp-mark` / `.exhibit-tab` (Settle). |
| `src/components/landing/landing.css` | The public site (`.lp-*`), incl. page hero, doorway, legal. |
| `src/components/house/*` | `RatingBand`, `CreditRoll`, `Snipe`, `ReelEnd`, `MarqueeBoard`, `Laurel` (+ `Sprig`), `TabIcons`, `ApplicationStrip`. |
| `src/components/site/*` | `SiteShell` (+ `PageHero`, `Slate`), `SiteNav`, `NavAuth`, `SiteCredits`, `Doorway`. |
| `src/components/landing/*` | `ProjectorHero` (measured beam, dust, leader countdown, motor sound), `LandingFX`, `DealDemo`. |
| `src/lib/tape.ts`, `member-no.ts`, `genre-dots.ts` | Stripe colour per tape, card number per member, video-store genre colours. |

### Web — screens
- **Landing** (`Landing.tsx`), condensed: projector hero (headline, a
  one-sentence gloss under each half, an admission board beside it) → ticker →
  green band → The Deal beside the dial demo, with the three public games as door plates →
  The Greenlight beside the playable ballot, then five caption-only frames and
  the live fund bar → Theatre channel guide → house picks → the opening of the
  founder's letter → two doors → four-question Q&A → last call → credits.
  About 1,100 words, down from 2,187; 9.7 desktop screens, down from 13.2.
- **The Theatre** (`/tv`, `src/app/tv/LateShow.tsx` + `theatre.css`): you
  arrive in the chair (the lobby step and its canvas are gone). The room is
  still the photograph and still pans; it is pushed in on the set, and how
  far is CSS (`--zoom`, `--view` on `.th-window`). The remote is drawn —
  `.remote`, a key per channel, an LCD line, five function keys — and sits
  under the set on a phone, beside it on a desk. Guide (`.th-guide`), tape
  card (`.th-now`), week's feature (`.th-feature`), test card and static for
  an idle or empty tube. On a desk the page steps out of the phone column
  (`.app-frame:has(.th)`). **The API still serves `scene.dash`** (the old
  console photograph and its key boxes) because the native app reads it; the
  web no longer does.
- **Tonight's deal area**: Now Showing is a small set (`.now-set`); the box
  office's controls are mood keys, a three-stop dial and a switch (`.bo-chip`,
  `.bo-depth`, `.bo-switch`); the rental case has a bigger one-sheet with the
  facts beside it and the clerk's card full width beneath. Dealing shows
  drawn reels; the confetti is drawn ticket stubs.
- **Detail pages** the front page links to: `/deal` (how the programming
  works — new), `/about` (the founder's letter, whole — new), `/fund`, `/vote`.
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

## 4. The native rooms — done

`deep-cut-native/src/components/rooms.tsx` is the native port of
`platform.css`. It exports `MarqueeBoard`, `BoxOffice`, `Grille`, `VhsCase`,
`CaseSticker`, `GenreDots`, `StampButton`, `ShelfLip`, `MemberCard`,
`memberNo`, `PunchCard`, `FeltBoard`, `Cork`, `Pinned`, `PaperHead`,
`ApplicationStrip`, `Dymo`, `BoothPlate`.

All ten screens are wired. The six from `6267944` (tonight, RecCard,
ProfileScreen, ProjectionistCard, community, TakesWall) plus the four that
`1294f47` finished: settings on dymo-labelled booth plates, the comment card
as a printed form, the mixtapes create view on a blank cassette label, and
onboarding's membership-application strip. Orphaned styles were cleared in
the same commit. Every native tab was then checked through the web export
against mock data (`03cf4e6`).

## 5. After that — where it stands

Owner's last ask was "I think we can do more", weighted to the platform.

Landed since:

- **Community feed** items are lobby cards, web and native; **Inbox** is a
  pigeonhole of cubbies with "while you were out" slips and carbon copies;
  **film page actions** are rubber stamps; **You** poster grids are contact
  sheets with frame numbers (`49d0acd`, `c1fbd0f`, `03cf4e6`).
- **Settle It / Just Roll It / This Meets That** interiors — the three doors
  off Tonight now open onto equipment rather than plain screens: a television
  set with a tuner, a splicing bench, and a case docket. Emoji and the
  second-joke-inside-the-form copy went with it. Checked at 390px.

Still not started:

- **The Theatre** (`/tv`) is already the richest screen; left alone.
- A real-device pass on native (see §7).
- Native tab bar is still emoji; the web's are drawn SVGs. Needs
  `react-native-svg`, which §2 says not to add casually — ask first.
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
npx tsc --noEmit && npx vitest run          # web: 65 files / 519 tests pass
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
- The live site (thedeepcut.xyz) has lagged the branch — the owner has sent
  screenshots of copy that was already fixed. Check the branch before
  "fixing" something from a screenshot.
- The $150 lifetime line used to sit in the hero and again under "how a film
  gets made". It now appears once, under the last call. Where it is shown is
  the owner's call — it was moved to keep the first screen to the pitch.
- The rating band is on the front page, ahead of the two features, and is
  worded like the real card: "approved for all audiences", with a box naming
  the two features. The owner likes the band and found its earlier copy
  cheesy ("people who stay through the credits", "deep cuts only", and
  before that "may contain subtitles") — keep anything written on it plain.
- Native Theatre still shows the old sci-fi console (`scene.dash` from
  `/api/shorts`). The web remote is the model for replacing it.
- The Theatre preview ran on placeholder Vimeo ids, so the frame around a
  playing film is verified and a real film inside it is not.
- Emoji were taken off buttons and headings across the signed-in app.
  Reaction counters on the takes wall, toast icons, the streak badge and the
  ratings tomato were left: those are icons doing a job, not decoration.
- `SettingsScreen.tsx` contains two different monthly prices ($4.99 in a
  comment, $3.99 on the button). Not touched; no price is quoted in new copy.
