import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cacheMovie: vi.fn(),
  generateRecCandidates: vi.fn(),
  inserted: [] as number[],
}));

vi.mock("@/lib/ai", () => ({
  // The mock must mirror the module's real surface: when createLlmTrace was
  // missing here, calling it threw and the LLM round silently degraded to the
  // Discover fallback — a green-looking test covering nothing.
  createLlmTrace: () => ({
    model: "mock-model", requests: 1, modelsTried: 1, repaired: false, waitedMs: 0,
  }),
  generateRecCandidates: mocks.generateRecCandidates,
  generateTasteProfile: vi.fn(),
}));
vi.mock("@/lib/tmdb", () => ({
  cacheMovie: mocks.cacheMovie,
  resolveTitleYear: vi.fn(async (title: string) => Number(title)),
  getSimilarMovies: vi.fn(async () =>
    Array.from({ length: 12 }, (_, i) => ({ id: 100 + i }))),
  discoverMovies: vi.fn(async () => []),
  resolveKeywordIds: vi.fn(async () => []),
  // The real map, not a one-key stub: engine's movieGenreIds() reads genre NAMES
  // through this to run the vibe gate, so a fixture tagged "Thriller" maps to 53
  // only if the key exists here. A stub silently made every gate assertion pass.
  TMDB_GENRE_IDS: {
    Drama: 18, Horror: 27, Thriller: 53, Action: 28, Crime: 80, Adventure: 12,
  },
}));
vi.mock("@/lib/signals", () => ({
  getRecentSignals: vi.fn(async () => []),
  signalLine: vi.fn(),
}));
vi.mock("@/lib/region", () => ({
  getUserRegion: vi.fn(async () => ({ region: "US", regionKnown: true })),
  normalizeRegion: vi.fn((region: string) => region),
  serviceAvailableIn: vi.fn(() => true),
}));
vi.mock("@/lib/analytics", () => ({ track: vi.fn(async () => {}) }));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      let columns = "";
      let pending: Array<{ movie_id: number }> | null = null;
      const query = {
        select(value: string) { columns = value; return query; },
        eq() { return query; },
        order() { return query; },
        limit() { return query; },
        range() { return query; },
        // Accepts one row or a batch — persistRecs writes survivors in a single
        // upsert statement and only falls back to per-row inserts on a database
        // error.
        insert(value: { movie_id?: number } | Array<{ movie_id?: number }>) {
          const rows = Array.isArray(value) ? value : [value];
          pending = rows.map((r) => ({ movie_id: Number(r.movie_id) }));
          return query;
        },
        // The batch write path (upsert + ignoreDuplicates) — same mock behaviour.
        upsert(value: { movie_id?: number } | Array<{ movie_id?: number }>) {
          return query.insert(value);
        },
        async single() {
          if (!pending) return { data: null, error: null };
          if (table === "recommendations") mocks.inserted.push(...pending.map((r) => r.movie_id));
          const last = pending[pending.length - 1];
          pending = null;
          return { data: { id: `rec-${last.movie_id}`, movie_id: last.movie_id }, error: null };
        },
        async maybeSingle() {
          return { data: table === "taste_profiles"
            ? { threads: [{ title: "Drama", line: "Character stories" }] }
            : { batch: 0 } };
        },
        then(resolve: (value: { data: unknown[] }) => unknown) {
          if (pending) {
            const rows = pending.map((r) => ({ id: `rec-${r.movie_id}`, movie_id: r.movie_id }));
            // Only recommendations carry a film id — the fire-and-forget
            // ai_logs row must not masquerade as a dealt film here.
            if (table === "recommendations") {
              mocks.inserted.push(...rows.map((r) => r.movie_id));
            }
            pending = null;
            return Promise.resolve({ data: rows, error: null }).then(resolve);
          }
          const data = table === "loved_movies" && columns.includes("overview")
            ? [{ movie_id: 900, movies: {
              id: 900, title: "Loved seed", year: 2000, genres: ["Drama"], overview: "",
            } }]
            : [];
          return Promise.resolve({ data }).then(resolve);
        },
      };
      return query;
    },
  }),
}));

import { dealRecs } from "@/lib/engine";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inserted.length = 0;
  vi.spyOn(console, "info").mockImplementation(() => {});
  mocks.generateRecCandidates.mockResolvedValue({
    raw: "mock output",
    candidates: { recs: Array.from({ length: 8 }, (_, i) => ({
      title: String(i + 1), year: 2000, reason: "Taste match",
    })) },
  });
  mocks.cacheMovie.mockImplementation(async (id: number) => {
    if (id === 100) throw new Error("lookup failed");
    return {
      id, title: `Movie ${id}`, year: 2000, genres: ["Drama"],
      vote_count: 400, imdb_votes: null, providers: {},
      ratings: { imdb: 7, tmdb: 7, rt: null },
    };
  });
});
afterEach(() => vi.restoreAllMocks());

describe("dealRecs — ordered loved-similar enrichment", () => {
  it("skips a failed lookup, persists in graph order, and stops at the batch boundary", async () => {
    const recs = await dealRecs("mock-user", {
      obscurityMin: 1, obscurityMax: 5, myServicesOnly: false,
    });
    const expected = [1, 2, 3, 4, 5, 6, 7, 8, 101, 102, 103];
    expect(recs.map((rec) => rec.movieId)).toEqual(expected);
    expect(mocks.inserted).toEqual(expected);
    // The loved-similar enrichment now runs *during* the LLM wait, so the order
    // of I/O calls is no longer a meaningful invariant — the persistence order
    // asserted above is. What must still hold: the failing lookup was attempted,
    // and only three loved-similar films were kept.
    const called = mocks.cacheMovie.mock.calls.map(([id]) => id);
    expect(called).toEqual(expect.arrayContaining([1, 2, 3, 4, 5, 6, 7, 8, 100]));
    expect(recs.slice(8).map((rec) => rec.movieId)).toEqual([101, 102, 103]);
    expect(recs[8].reason).toBe("Because you loved Loved seed — a deeper cut in the same vein, 2000.");
    const log = vi.mocked(console.info).mock.calls[0];
    const record = JSON.parse(String(log[1]));
    expect(record.outcome).toBe("success");
    // ai_log_write and tracking are gone from the critical path — those writes
    // are now fire-and-forget, so they must NOT appear as stages.
    expect(Object.keys(record.stagesMs)).toEqual([
      "context", "llm", "tmdb_validate", "persist",
      "loved_similar_graph", "loved_similar_lookup_and_persist", "discover",
    ]);
    // Step 0: the record explains the LLM stage, not just its duration.
    expect(record.meta).toMatchObject({ llm_model: "mock-model", llm_requests: 1, persist_path: "batch" });
  });
});

describe("dealRecs — a genre-defining vibe rejects its adjacent genres", () => {
  // Real leaks this pins down: "Scare me" was genreIds [27, 53] with
  // requireGenreIds [27, 53], and the gate accepts a film matching ANY of them —
  // so thrillers carrying no Horror were dealt as horror. K.G.F: Chapter 1
  // (Action/Thriller/Adventure/Crime) arrived through the LLM round, The
  // Substitute (Action/Crime/Drama/Thriller) through the loved-similar round,
  // its card reading "Because you loved Fight Club".
  const KGF = ["Action", "Thriller", "Adventure", "Crime"]; // id 1 — LLM round
  const SUBSTITUTE = ["Action", "Crime", "Drama", "Thriller"]; // id 100 — loved-similar round
  const HORROR = ["Horror"];

  // Every id is horror except the two thriller-only leaks, so any film missing
  // from the deal means the vibe gate rejected it, not the obscurity/rating/year
  // gates (identical vote_count, ratings and year across the fixtures).
  const fixture = (id: number) => ({
    id,
    title: `Movie ${id}`,
    year: 2000,
    genres: id === 1 ? KGF : id === 100 ? SUBSTITUTE : HORROR,
    vote_count: 400,
    imdb_votes: null,
    providers: {},
    ratings: { imdb: 7, tmdb: 7, rt: null },
  });

  it("drops the thriller-only films from both the LLM and loved-similar rounds", async () => {
    mocks.cacheMovie.mockImplementation(async (id: number) => fixture(Number(id)));
    const recs = await dealRecs("mock-user", {
      obscurityMin: 1, obscurityMax: 5, myServicesOnly: false, vibe: "scare",
    });
    const dealt = recs.map((rec) => rec.movieId);
    expect(dealt).not.toContain(1); // K.G.F: Chapter 1 analogue
    expect(dealt).not.toContain(100); // The Substitute analogue
    expect(mocks.inserted).not.toContain(1);
    expect(mocks.inserted).not.toContain(100);
    // The night still deals: on-vibe films survive the tightened gate.
    expect(dealt).toContain(2);
    expect(dealt).toContain(101);
  });

  it("keeps those same thrillers when the vibe makes no genre claim (control)", async () => {
    // "Edge of my seat" is a TONE vibe with no requireGenreIds, so the fixtures
    // above must come through — proving the exclusions in the Scare test are the
    // genre gate's doing and nothing else in the pipeline.
    mocks.cacheMovie.mockImplementation(async (id: number) => fixture(Number(id)));
    const recs = await dealRecs("mock-user", {
      obscurityMin: 1, obscurityMax: 5, myServicesOnly: false, vibe: "edge",
    });
    const dealt = recs.map((rec) => rec.movieId);
    expect(dealt).toContain(1);
    expect(dealt).toContain(100);
  });
});
