// "Settle It" — the two-person couch-standoff engine, VERBATIM from the web
// app (../src/lib/settle.ts + obscurity.ts, concatenated by script so
// the scoring can never drift). Pure functions — no platform code.

// Obscurity score 1–5 from TMDB vote_count bands, with fame caps applied below.
// 1 = blockbuster, 3 = less-seen, 4 = niche, 5 = deep cut.
// Calibrated to TMDB's actual scale (its most-voted films sit ~30-40k votes —
// Inception ~37k, Shawshank ~30k — nothing like IMDb's 2M+):
//   >20k blockbuster · >8k popular · >2.5k less-seen · >800 niche · ≤800 deep cut

export const MIN_LESS_SEEN_OBSCURITY = 3;

export function obscurityFromVoteCount(voteCount: number): 1 | 2 | 3 | 4 | 5 {
  if (voteCount > 20_000) return 1;
  if (voteCount > 8_000) return 2;
  if (voteCount > 2_500) return 3;
  if (voteCount > 800) return 4;
  return 5;
}

/**
 * Honest obscurity: vote count says how many people have MET a film, but only
 * time turns "few votes" into "deep cut". A 2026 franchise tentpole has 600
 * votes because it opened last month, not because it's hidden — its TMDB
 * `popularity` (rolling current buzz) is screaming. So fame CAPS obscurity:
 *
 *  - Any film: buzz ≥80 caps at 1, ≥35 at 2, ≥15 at 3 (deep cuts idle <15).
 *  - Films <2 years old: stricter caps (≥40→1, ≥18→2), and NEVER above 3 —
 *    deep-cut status (4–5) must be earned over time, full stop.
 *
 * Caps only lower the vote-count score, never raise it, so a genuinely met
 * film can't masquerade as obscure but a real deep cut is never inflated.
 */
export function effectiveObscurity(movie: {
  vote_count: number;
  popularity?: number | null;
  year?: number | null;
}): 1 | 2 | 3 | 4 | 5 {
  const base = obscurityFromVoteCount(movie.vote_count);
  const pop = movie.popularity ?? 0;
  const isRecent = movie.year != null && movie.year >= new Date().getFullYear() - 2;

  let cap: 1 | 2 | 3 | 4 | 5 = 5;
  if (isRecent) {
    if (pop >= 40) cap = 1;
    else if (pop >= 18) cap = 2;
    else cap = 3; // new + quiet can be niche, never yet a certified deep cut
  } else {
    if (pop >= 80) cap = 1;
    else if (pop >= 35) cap = 2;
    else if (pop >= 15) cap = 3;
  }
  return (base < cap ? base : cap) as 1 | 2 | 3 | 4 | 5;
}

/** ◆◆◆◇◇-style string for UI + taste card. */
export function obscurityDots(score: number): string {
  const s = Math.min(5, Math.max(1, Math.round(score)));
  return "◆".repeat(s) + "◇".repeat(5 - s);
}

// "Settle It" — two-person couch-standoff engine. Pure functions + a mock
// pool; zero backend by design (see the build ticket). The scoring is the
// ticket's algorithm verbatim: deterministic, explainable, feels smart.


export type Mood = "laugh" | "scared" | "feel";

export interface SettleAnswers {
  name: string;
  mood: Mood; // Q1
  brain: 0 | 1 | 2; // Q2 — None < Some < Puzzle
  wantsShort: boolean; // Q3
  wantsNew: boolean; // Q4
  obscurity: 2 | 3 | 4; // Q5 — increasingly hidden-gem-focused
}

export interface SettleFilm {
  title: string;
  year: number;
  min: number;
  genres: string[];
  mood: Mood;
  brain: 0 | 1 | 2; // brain REQUIRED to enjoy it
  obscurity: 0 | 1 | 2 | 3 | 4;
  canonical: boolean; // widely-seen classic — fails the "new to both" wish
  houseConviction: 1 | 2 | 3 | 4 | 5;
  vibe: string; // the marquee hook line
  whyTrait: string; // resolving trait for the "why this settles it" line
  streaming: string[];
  tmdbId?: number; // set for real-data films — poster comes free, no search
  posterPath?: string | null;
}

// ── The five questions (ticket content, verbatim) ───────────────────
export const SETTLE_QUESTIONS = [
  {
    key: "mood",
    prompt: "Tonight we're in the mood to…",
    options: [
      { label: "Laugh", value: "laugh" },
      { label: "Be scared", value: "scared" },
      { label: "Feel something", value: "feel" },
    ],
  },
  {
    key: "brain",
    prompt: "How much brain do we have left?",
    options: [
      { label: "None (turn it off)", value: 0 },
      { label: "Some", value: 1 },
      { label: "Give me a puzzle", value: 2 },
    ],
  },
  {
    key: "wantsShort",
    prompt: "Runtime tolerance?",
    options: [
      { label: "Under 100 min", value: true },
      { label: "Don't care", value: false },
    ],
  },
  {
    key: "wantsNew",
    prompt: "Seen-it rule?",
    options: [
      { label: "Something new to both of us", value: true },
      { label: "A rewatch is fine", value: false },
    ],
  },
  {
    key: "obscurity",
    prompt: "How far off the map?",
    options: [
      { label: "A little hidden", value: 2 },
      { label: "A real hidden gem", value: 3 },
      { label: "As deep as possible", value: 4 },
    ],
  },
] as const;

// ── The house pool (~24, deep-cut leaning, mock data by design) ─────
export const SETTLE_POOL: SettleFilm[] = [
  { title: "What We Do in the Shadows", year: 2014, min: 86, genres: ["Comedy", "Horror"], mood: "laugh", brain: 0, obscurity: 2, canonical: false, houseConviction: 5, vibe: "Flatmate meeting, but everyone's undead.", whyTrait: "it's a horror movie that only wants to make you laugh", streaming: ["Kanopy", "Prime"] },
  { title: "One Cut of the Dead", year: 2017, min: 96, genres: ["Comedy", "Horror"], mood: "laugh", brain: 1, obscurity: 3, canonical: false, houseConviction: 5, vibe: "Do not stop the cameras.", whyTrait: "the scary half and the funny half literally take turns", streaming: ["Shudder"] },
  { title: "Game Night", year: 2018, min: 100, genres: ["Comedy", "Crime"], mood: "laugh", brain: 0, obscurity: 0, canonical: false, houseConviction: 4, vibe: "Charades, but the kidnapping is real.", whyTrait: "it's the crowd-pleaser that's smarter than it needed to be", streaming: ["Max"] },
  { title: "Hunt for the Wilderpeople", year: 2016, min: 101, genres: ["Comedy", "Adventure"], mood: "laugh", brain: 0, obscurity: 2, canonical: false, houseConviction: 4, vibe: "A boy, a grump, and the entire New Zealand bush.", whyTrait: "it's funny AND it sneaks the feelings in through the back door", streaming: ["Hulu", "Kanopy"] },
  { title: "Shaun of the Dead", year: 2004, min: 99, genres: ["Comedy", "Horror"], mood: "laugh", brain: 0, obscurity: 1, canonical: true, houseConviction: 4, vibe: "Have a pint and wait for this to blow over.", whyTrait: "it splits the difference between a laugh and a scream", streaming: ["Prime"] },
  { title: "The Nice Guys", year: 2016, min: 116, genres: ["Comedy", "Crime"], mood: "laugh", brain: 1, obscurity: 1, canonical: false, houseConviction: 4, vibe: "The worst detectives in 1977 Los Angeles.", whyTrait: "it's a mystery you can solve with a drink in hand", streaming: ["Netflix"] },
  { title: "Popstar: Never Stop Never Stopping", year: 2016, min: 87, genres: ["Comedy", "Music"], mood: "laugh", brain: 0, obscurity: 2, canonical: false, houseConviction: 3, vibe: "The Citizen Kane of idiot pop-star documentaries.", whyTrait: "87 minutes of pure turn-your-brain-off joy", streaming: ["Prime"] },
  { title: "Support the Girls", year: 2018, min: 93, genres: ["Comedy", "Drama"], mood: "laugh", brain: 1, obscurity: 4, canonical: false, houseConviction: 3, vibe: "One very long shift at a highway sports bar.", whyTrait: "it's the deep cut that laughs so it doesn't cry", streaming: ["Kanopy"] },

  { title: "It Follows", year: 2014, min: 100, genres: ["Horror", "Thriller"], mood: "scared", brain: 1, obscurity: 1, canonical: false, houseConviction: 4, vibe: "It walks. It never stops walking.", whyTrait: "it's dread you can share without a single cheap shot", streaming: ["Netflix"] },
  { title: "Green Room", year: 2015, min: 95, genres: ["Thriller", "Horror"], mood: "scared", brain: 1, obscurity: 2, canonical: false, houseConviction: 4, vibe: "Wrong gig. Wrong club. Wrong crowd.", whyTrait: "95 minutes with its jaw clenched the whole time", streaming: ["Prime"] },
  { title: "Barbarian", year: 2022, min: 102, genres: ["Horror", "Thriller"], mood: "scared", brain: 1, obscurity: 1, canonical: false, houseConviction: 4, vibe: "The Airbnb is double-booked. That's the good part.", whyTrait: "it swerves hard enough to shut both of you up", streaming: ["Max"] },
  { title: "Ready or Not", year: 2019, min: 95, genres: ["Horror", "Comedy"], mood: "scared", brain: 0, obscurity: 1, canonical: false, houseConviction: 4, vibe: "In-laws. Hide and seek. To the death.", whyTrait: "scary for one of you, hilarious for the other, short for both", streaming: ["Hulu"] },
  { title: "Coherence", year: 2013, min: 89, genres: ["Science Fiction", "Thriller"], mood: "scared", brain: 2, obscurity: 3, canonical: false, houseConviction: 4, vibe: "A dinner party and a passing comet.", whyTrait: "an 89-minute puzzle box that cost less than your couch", streaming: ["Tubi"] },
  { title: "Train to Busan", year: 2016, min: 118, genres: ["Horror", "Action"], mood: "scared", brain: 0, obscurity: 1, canonical: false, houseConviction: 4, vibe: "Zombies. One train. No brakes.", whyTrait: "it's the scary one that makes you feel something anyway", streaming: ["Prime", "Tubi"] },
  { title: "The Invitation", year: 2015, min: 100, genres: ["Thriller", "Horror"], mood: "scared", brain: 2, obscurity: 3, canonical: false, houseConviction: 3, vibe: "Dinner with the ex. What could go wrong?", whyTrait: "slow-burn suspicion you get to argue about in real time", streaming: ["Netflix"] },
  { title: "Creep", year: 2014, min: 77, genres: ["Horror", "Thriller"], mood: "scared", brain: 0, obscurity: 3, canonical: false, houseConviction: 3, vibe: "One craigslist gig. One camera. One weirdo.", whyTrait: "77 minutes — barely longer than deciding what to watch", streaming: ["Netflix"] },
  { title: "His House", year: 2020, min: 93, genres: ["Horror", "Drama"], mood: "scared", brain: 1, obscurity: 3, canonical: false, houseConviction: 4, vibe: "The walls came with them.", whyTrait: "a deep cut that's scary AND about something", streaming: ["Netflix"] },

  { title: "Aftersun", year: 2022, min: 102, genres: ["Drama"], mood: "feel", brain: 1, obscurity: 2, canonical: false, houseConviction: 5, vibe: "A camcorder summer you can't quite rewind.", whyTrait: "it hits like a freight train moving very, very slowly", streaming: ["Max", "Kanopy"] },
  { title: "Past Lives", year: 2023, min: 105, genres: ["Drama", "Romance"], mood: "feel", brain: 1, obscurity: 1, canonical: false, houseConviction: 4, vibe: "Two lives, one what-if.", whyTrait: "quiet enough for a tired night, deep enough to talk about after", streaming: ["Prime"] },
  { title: "In Bruges", year: 2008, min: 107, genres: ["Comedy", "Drama"], mood: "feel", brain: 1, obscurity: 1, canonical: false, houseConviction: 5, vibe: "Purgatory has canals and very good beer.", whyTrait: "it's the feelings movie that's secretly hilarious", streaming: ["Max"] },
  { title: "Columbus", year: 2017, min: 100, genres: ["Drama"], mood: "feel", brain: 2, obscurity: 4, canonical: false, houseConviction: 3, vibe: "Two people, held up by architecture.", whyTrait: "the deep cut that feels like a deep breath", streaming: ["Kanopy"] },
  { title: "Memories of Murder", year: 2003, min: 131, genres: ["Crime", "Drama"], mood: "feel", brain: 2, obscurity: 2, canonical: false, houseConviction: 5, vibe: "The case that never closes.", whyTrait: "a puzzle for one of you, a gut-punch for the other", streaming: ["Hulu"] },
  { title: "Paddington 2", year: 2017, min: 103, genres: ["Comedy", "Family"], mood: "feel", brain: 0, obscurity: 0, canonical: true, houseConviction: 5, vibe: "A bear, a prison, a redemption arc.", whyTrait: "nobody has ever stayed mad through it", streaming: ["Netflix"] },
  { title: "The Farewell", year: 2019, min: 100, genres: ["Comedy", "Drama"], mood: "feel", brain: 1, obscurity: 2, canonical: false, houseConviction: 4, vibe: "The lie is the gift.", whyTrait: "it laughs and grieves in the same breath — exactly 100 minutes", streaming: ["Prime", "Kanopy"] },
  { title: "Sing Street", year: 2016, min: 106, genres: ["Comedy", "Music", "Romance"], mood: "feel", brain: 0, obscurity: 2, canonical: false, houseConviction: 4, vibe: "Start a band, impress a girl, escape Dublin.", whyTrait: "it's feel-good with an actual soundtrack argument built in", streaming: ["Netflix"] },
  { title: "Petite Maman", year: 2021, min: 72, genres: ["Drama", "Fantasy"], mood: "feel", brain: 1, obscurity: 4, canonical: false, houseConviction: 4, vibe: "A treehouse, a secret, and someone familiar in the woods.", whyTrait: "72 minutes that land softer than most trilogies", streaming: ["Hulu", "Kanopy"] },
  { title: "Marcel the Shell with Shoes On", year: 2021, min: 90, genres: ["Animation", "Comedy", "Drama"], mood: "feel", brain: 0, obscurity: 2, canonical: false, houseConviction: 4, vibe: "One-inch shell, enormous heart.", whyTrait: "it's gentle enough for no brain and sweet enough to fix the argument", streaming: ["Netflix"] },
];

export const SETTLE_DEEP_CUT_POOL = SETTLE_POOL.filter(
  (film) => film.obscurity >= MIN_LESS_SEEN_OBSCURITY - 1 && film.houseConviction >= 4,
);

// ── Real-data pool: map a couch to a TMDB query, films back to SettleFilm ──

// TMDB genre ids per mood (union of both players' moods seeds the query).
export const MOOD_GENRES: Record<Mood, number[]> = {
  laugh: [35], // Comedy
  scared: [27, 53], // Horror, Thriller
  feel: [18, 10749], // Drama, Romance
};

const GENRE_NAME: Record<number, string> = {
  28: "action", 12: "adventure", 16: "animated", 35: "comedy", 80: "crime",
  99: "documentary", 18: "drama", 10751: "family", 14: "fantasy", 36: "history",
  27: "horror", 10402: "musical", 9648: "mystery", 10749: "romance",
  878: "sci-fi", 53: "thriller", 10752: "war", 37: "western",
};

const BRAINY_GENRES = new Set([9648, 878, 53, 80]); // mystery, sci-fi, thriller, crime
const LIGHT_GENRES = new Set([35, 10751, 16, 10402]); // comedy, family, animation, music

export interface PoolCandidate {
  id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  overview: string;
  genre_ids: number[];
  vote_count: number;
  popularity: number;
  imdb_votes?: number | null;
}

// Settle rides the app-wide honest scorer (fame caps obscurity; new films
// can't be deep cuts) — shifted to Settle's 0–4 scale.
function obscurityFromCandidate(c: {
  vote_count: number;
  popularity?: number | null;
  year?: number | null;
  imdb_votes?: number | null;
}): 0 | 1 | 2 | 3 | 4 {
  return (effectiveObscurity(c) - 1) as 0 | 1 | 2 | 3 | 4;
}

/** Turn TMDB candidates into scorable SettleFilms with derived, honest tags. */
export function candidatesToFilms(cands: PoolCandidate[], eitherShort: boolean): SettleFilm[] {
  return cands
    .filter((c) => c.title && c.year)
    .map((c): SettleFilm => {
      const ids = c.genre_ids;
      const mood: Mood = ids.includes(27) || ids.includes(53) ? "scared" : ids.includes(35) ? "laugh" : "feel";
      const brain: 0 | 1 | 2 = ids.some((g) => BRAINY_GENRES.has(g))
        ? 2
        : ids.some((g) => LIGHT_GENRES.has(g))
          ? 0
          : 1;
      const obscurity = obscurityFromCandidate(c);
      const genreName = GENRE_NAME[ids[0]] ?? "one";
      const secondGenre = ids[1] ? GENRE_NAME[ids[1]] : null;
      const label = secondGenre ? `${genreName}-${secondGenre}` : genreName;
      return {
        title: c.title,
        year: c.year!,
        // Query already runtime-filtered when short was asked; real value is
        // fetched lazily for display. Scoring only needs the band.
        min: eitherShort ? 95 : 108,
        genres: [genreName, secondGenre].filter(Boolean).map((g) => g![0].toUpperCase() + g!.slice(1)) as string[],
        mood,
        brain,
        obscurity,
        canonical: c.vote_count > 9000,
        houseConviction: Math.min(5, Math.max(1, Math.round(c.popularity / 40))) as 1 | 2 | 3 | 4 | 5,
        vibe: c.overview ? c.overview.split(". ")[0].replace(/\.$/, "") + "." : `A ${label} the house stands behind.`,
        whyTrait: `a ${label} both of you can live with`,
        streaming: [],
        tmdbId: c.id,
        posterPath: c.poster_path,
      };
    });
}

// ── Scoring (ticket §3, implemented exactly) ────────────────────────
export interface Verdict {
  film: SettleFilm;
  score: number;
  why: string;
}

const MOOD_WORD: Record<Mood, string> = {
  laugh: "funny",
  scared: "scary",
  feel: "something that hits",
};

function whyLine(p1: SettleAnswers, p2: SettleAnswers, film: SettleFilm): string {
  const base =
    p1.mood === p2.mood
      ? `You both wanted ${MOOD_WORD[p1.mood]} — ${film.whyTrait}.`
      : `${p1.name} wanted ${MOOD_WORD[p1.mood]}, ${p2.name} wanted ${MOOD_WORD[p2.mood]} — ${film.whyTrait}.`;
  const eitherShort = p1.wantsShort || p2.wantsShort;
  if (eitherShort && film.min < 100) {
    return `${base} And it's ${film.min} minutes — in, out, nobody falls asleep.`;
  }
  return base;
}

export function scoreFilm(film: SettleFilm, p1: SettleAnswers, p2: SettleAnswers): number {
  let score = 0;

  // MOOD — weight 3, consensus bonus 2
  const m1 = film.mood === p1.mood;
  const m2 = film.mood === p2.mood;
  if (m1 || m2) score += 3;
  if (m1 && m2) score += 2;

  // BRAIN — weight 2, protect the tired player
  const effectiveBrain = Math.min(p1.brain, p2.brain);
  if (film.brain <= effectiveBrain) score += 2;

  // RUNTIME — weight 2, either player's "short" is a real constraint
  const eitherShort = p1.wantsShort || p2.wantsShort;
  if (eitherShort && film.min < 100) score += 2;
  if (eitherShort && film.min >= 110) score -= 3;

  // NOVELTY — weight 1
  if (p1.wantsNew && p2.wantsNew && !film.canonical) score += 1;

  // OBSCURITY — weight 2, reward proximity to the averaged dial
  const target = (p1.obscurity + p2.obscurity) / 2;
  score += 2 - Math.abs(film.obscurity - target);

  // deterministic tiebreaker
  score += film.houseConviction * 0.1;

  return score;
}

/** Every film ranked best-first; index into this for re-rolls. */
export function rankVerdicts(
  p1: SettleAnswers,
  p2: SettleAnswers,
  pool: SettleFilm[] = SETTLE_DEEP_CUT_POOL,
): Verdict[] {
  const seen = new Set<string>();
  return pool
    .map((film) => ({
      film,
      score: scoreFilm(film, p1, p2),
      why: whyLine(p1, p2, film),
    }))
    .sort((a, b) => b.score - a.score || a.film.title.localeCompare(b.film.title))
    .filter((v) => {
      // Real-data pages can repeat titles across genres — dedupe.
      const k = `${v.film.title}|${v.film.year}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/** Genre ids to seed a TMDB query from both players' moods + obscurity dial. */
export function poolQueryFor(p1: SettleAnswers, p2: SettleAnswers) {
  const genreIds = Array.from(new Set([...MOOD_GENRES[p1.mood], ...MOOD_GENRES[p2.mood]]));
  const target = (p1.obscurity + p2.obscurity) / 2; // Settle's 2..4 maps to shared 3..5
  return {
    genreIds,
    // The target ranks candidates; only the global floor limits eligibility.
    obscurityMin: MIN_LESS_SEEN_OBSCURITY,
    obscurityMax: 5,
    eitherShort: p1.wantsShort || p2.wantsShort,
  };
}
