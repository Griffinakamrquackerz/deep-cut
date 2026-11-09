import { describe, expect, it } from "vitest";
import {
  SETTLE_POOL,
  SETTLE_DEEP_CUT_POOL,
  SETTLE_QUESTIONS,
  candidatesToFilms,
  poolQueryFor,
  rankVerdicts,
  scoreFilm,
  type PoolCandidate,
  type SettleAnswers,
  type SettleFilm,
} from "@/lib/settle";

const player = (over: Partial<SettleAnswers>): SettleAnswers => ({
  name: "P",
  mood: "laugh",
  brain: 1,
  wantsShort: false,
  wantsNew: false,
  obscurity: 2,
  ...over,
});

const film = (over: Partial<SettleFilm>): SettleFilm => ({
  title: "Test Film",
  year: 2020,
  min: 95,
  genres: ["Drama"],
  mood: "laugh",
  brain: 1,
  obscurity: 2,
  canonical: false,
  houseConviction: 3,
  vibe: "v",
  whyTrait: "it resolves things",
  streaming: ["Netflix"],
  ...over,
});

describe("settle pool & questions", () => {
  it("has ~24 films with every required field", () => {
    expect(SETTLE_POOL.length).toBeGreaterThanOrEqual(20);
    for (const f of SETTLE_POOL) {
      expect(f.title.length).toBeGreaterThan(0);
      expect(f.min).toBeGreaterThan(60);
      expect(f.obscurity).toBeGreaterThanOrEqual(0);
      expect(f.obscurity).toBeLessThanOrEqual(4);
      expect(f.streaming.length).toBeGreaterThan(0);
      expect(f.whyTrait.length).toBeGreaterThan(0);
    }
  });

  it("covers all three moods and both runtime bands", () => {
    for (const mood of ["laugh", "scared", "feel"] as const) {
      expect(SETTLE_POOL.filter((f) => f.mood === mood).length).toBeGreaterThanOrEqual(6);
      expect(
        SETTLE_POOL.filter((f) => f.mood === mood && f.min < 100).length,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("ships the five ticket questions verbatim", () => {
    expect(SETTLE_QUESTIONS).toHaveLength(5);
    expect(SETTLE_QUESTIONS[0].prompt).toBe("Tonight we're in the mood to…");
    expect(SETTLE_QUESTIONS[2].options.map((o) => o.label)).toEqual([
      "Under 100 min",
      "Don't care",
    ]);
  });

  it("only exposes eligible, well-regarded hidden gems in the curated fallback", () => {
    expect(SETTLE_DEEP_CUT_POOL.length).toBeGreaterThan(0);
    for (const f of SETTLE_DEEP_CUT_POOL) {
      expect(f.obscurity).toBeGreaterThanOrEqual(2);
      expect(f.houseConviction).toBeGreaterThanOrEqual(4);
    }
    expect(SETTLE_QUESTIONS[4].options.map((o) => o.label)).toEqual([
      "A little hidden",
      "A real hidden gem",
      "As deep as possible",
    ]);
  });

});

describe("scoring", () => {
  it("gives the consensus mood bonus on top of the either-match", () => {
    const f = film({ mood: "scared" });
    const one = scoreFilm(f, player({ mood: "scared" }), player({ mood: "laugh" }));
    const both = scoreFilm(f, player({ mood: "scared" }), player({ mood: "scared" }));
    expect(both - one).toBeCloseTo(2, 6);
  });

  it("protects the tired player: brainy film loses the brain points when either is fried", () => {
    const puzzle = film({ brain: 2 });
    const bothSharp = scoreFilm(puzzle, player({ brain: 2 }), player({ brain: 2 }));
    const oneFried = scoreFilm(puzzle, player({ brain: 2 }), player({ brain: 0 }));
    expect(bothSharp - oneFried).toBeCloseTo(2, 6);
  });

  it("enforces the runtime constraint when EITHER player wants short", () => {
    const long = film({ min: 130 });
    const short = film({ min: 88 });
    const p1 = player({ wantsShort: true });
    const p2 = player({ wantsShort: false });
    expect(scoreFilm(short, p1, p2) - scoreFilm(long, p1, p2)).toBeCloseTo(5, 6); // +2 vs -3
  });

  it("rewards obscurity proximity to the averaged dial", () => {
    const p1 = player({ obscurity: 2 });
    const p2 = player({ obscurity: 4 }); // target 3
    expect(
      scoreFilm(film({ obscurity: 3 }), p1, p2) - scoreFilm(film({ obscurity: 4 }), p1, p2),
    ).toBeCloseTo(1, 6);
  });
});

describe("verdicts", () => {
  const p1 = player({ name: "Sam", mood: "laugh", wantsShort: true });
  const p2 = player({ name: "Riley", mood: "scared", brain: 0 });

  it("ranks best-first and re-rolls give a different film", () => {
    const v = rankVerdicts(p1, p2);
    expect(v[0].score).toBeGreaterThanOrEqual(v[1].score);
    expect(v[0].film.title).not.toBe(v[1].film.title);
  });

  it("why-line references both players when moods differ, and changes with inputs", () => {
    const v = rankVerdicts(p1, p2)[0];
    expect(v.why).toContain("Sam wanted funny");
    expect(v.why).toContain("Riley wanted scary");
    const same = rankVerdicts(player({ mood: "feel" }), player({ mood: "feel" }))[0];
    expect(same.why).toContain("You both wanted");
    expect(same.why).not.toBe(v.why);
  });

  it("mentions the runtime when a short-wanting pair gets a sub-100 film", () => {
    const v = rankVerdicts(p1, p2)[0];
    if (v.film.min < 100) expect(v.why).toMatch(/minutes/);
  });

  it("dedupes repeated titles across a blended pool", () => {
    const dupe = SETTLE_POOL[0];
    const ranked = rankVerdicts(p1, p2, [dupe, ...SETTLE_POOL]);
    const keys = ranked.map((v) => `${v.film.title}|${v.film.year}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("real-data pool mapping", () => {
  const cand = (over: Partial<PoolCandidate>): PoolCandidate => ({
    id: 1,
    title: "Real Film",
    year: 2019,
    poster_path: "/p.jpg",
    overview: "A tense night. Then it gets worse.",
    genre_ids: [27, 53],
    vote_count: 3000,
    popularity: 120,
    ...over,
  });

  it("uses IMDb reach when mapping the visible obscurity score", () => {
    const [film] = candidatesToFilms([
      cand({ vote_count: 5_000, popularity: 5, imdb_votes: 80_000 }),
    ], false);
    expect(film.obscurity).toBe(1);
  });

  it("derives mood from genre ids and carries poster + tmdbId through", () => {
    const [f] = candidatesToFilms([cand({})], false);
    expect(f.mood).toBe("scared");
    expect(f.tmdbId).toBe(1);
    expect(f.posterPath).toBe("/p.jpg");
    expect(f.vibe).toBe("A tense night.");
  });

  it("marks the runtime band from the short flag so scoring can use it", () => {
    expect(candidatesToFilms([cand({})], true)[0].min).toBeLessThan(100);
    expect(candidatesToFilms([cand({})], false)[0].min).toBeGreaterThanOrEqual(100);
  });

  it("drops candidates with no year and produces scorable films", () => {
    const films = candidatesToFilms([cand({}), cand({ id: 2, year: null })], false);
    expect(films).toHaveLength(1);
    const p = player({ mood: "scared" });
    expect(scoreFilm(films[0], p, p)).toBeGreaterThan(0);
  });

  it("poolQueryFor unions both moods' genres and flags either-short", () => {
    const q = poolQueryFor(player({ mood: "laugh" }), player({ mood: "scared", wantsShort: true }));
    expect(q.genreIds).toContain(35); // comedy
    expect(q.genreIds).toContain(27); // horror
    expect(q.eitherShort).toBe(true);
    expect(q.obscurityMin).toBeGreaterThanOrEqual(3);
  });

  it("cannot lower the server request below hidden-gem obscurity", () => {
    const q = poolQueryFor(player({ obscurity: 2 }), player({ obscurity: 2 }));
    expect(q.obscurityMin).toBe(3);
    expect(q.obscurityMax).toBe(5);
  });
});
