// What these exist for.
//
// The deal was rearranged for speed: diagnostics writes went fire-and-forget,
// context became one wave, the loved-similar enrichment now runs *during* the
// model's call, and survivors are written in one statement. Every one of those
// is a change to *when* work happens. These tests pin down that none of them
// changed *what* the member is dealt — a frozen scenario, replayed, asserting
// the exact films, order, reasons and obscurity scores. Plus the two new
// failure modes the rearrangement introduced (a batch insert that rolls back,
// a diagnostics write that never lands).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cacheMovie: vi.fn(),
  generateRecCandidates: vi.fn(),
  getSimilarMovies: vi.fn(),
  discoverMovies: vi.fn(),
  history: {} as Record<string, Array<{ movie_id: number; movies: { title: string; year: number } }>>,
  lovedBriefs: [] as Array<{ movie_id: number; movies: { id: number; title: string; year: number; genres: string[]; overview: string } }>,
  historyCap: 500,
  unpagedHistoryCap: Infinity,
  keywordIds: [] as number[],
  lastBatch: 0,
  services: [] as Array<{ service: string }>,
  /** Logged completions, newest-first — read by the repeat-title miner. */
  aiLogs: [] as Array<{ raw: string }>,
  logReadError: false,
  logSignal: null as AbortSignal | null,
  historyFailure: false,
  ranges: [] as Array<{ table: string; start: number; end: number }>,
  insertErrors: {} as Record<number, string>,
  /** Tables whose rows were deleted (recycling path). */
  deletes: [] as Array<{ table: string; movieId?: number }>,
  /** Simulates the recycling delete failing (a delete outage). */
  failDelete: false,
  track: vi.fn(),
  /** Order of significant I/O, to prove the overlap is real. */
  events: [] as string[],
  /** Every recommendations write, as it was issued. */
  recWrites: [] as Array<Array<{ movie_id: number; reason: string; obscurity: number }>>,
  logWrites: 0,
  /** Simulate the multi-row insert being rejected wholesale. */
  failBatch: false,
  /** Options captured from the last batch insert call. */
  batchInsertOptions: null as Record<string, unknown> | null,
  /** Simulate a diagnostics write that never comes back. */
  hangDiagnostics: false,
  trace: {
    model: "openai/gpt-oss-120b", requests: 3, modelsTried: 2, repaired: true, waitedMs: 4000,
  },
}));

vi.mock("@/lib/ai", () => ({
  createLlmTrace: () => ({ ...mocks.trace }),
  generateRecCandidates: mocks.generateRecCandidates,
  generateTasteProfile: vi.fn(),
}));

vi.mock("@/lib/tmdb", () => ({
  cacheMovie: mocks.cacheMovie,
  resolveTitleYear: vi.fn(async (title: string) => {
    if (title === "Hallucination") return null; // a film TMDB has never heard of
    if (title === "Already loved") return 900; // the member's own loved film
    return Number(title);
  }),
  getSimilarMovies: mocks.getSimilarMovies,
  discoverMovies: mocks.discoverMovies,
  resolveKeywordIds: vi.fn(async () => mocks.keywordIds),
  TMDB_GENRE_IDS: {
    Drama: 18, Horror: 27, Comedy: 35, Family: 10751, Animation: 16,
    Mystery: 9648, "Science Fiction": 878, Thriller: 53,
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

vi.mock("@/lib/analytics", () => ({ track: mocks.track }));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      let columns = "";
      let range: { start: number; end: number } | null = null;
      let pending: Array<{ movie_id: number }> | null = null;

      const never = () => new Promise(() => {}) as Promise<{ data: null; error: null }>;

      if (table === "ai_logs") {
        // Reads must not count as diagnostic writes.
        const logsQuery = {
          select() { return logsQuery; },
          eq() { return logsQuery; },
          order() { return logsQuery; },
          limit() { return logsQuery; },
          abortSignal(signal: AbortSignal) { mocks.logSignal = signal; return logsQuery; },
          then(resolve: (v: { data: Array<{ raw: string }> | null; error: { message: string } | null }) => unknown) {
            return Promise.resolve(mocks.logReadError
              ? { data: null, error: { message: "unavailable" } }
              : { data: mocks.aiLogs, error: null }).then(resolve);
          },
        };
        return {
          insert: () => {
            mocks.logWrites++;
            return mocks.hangDiagnostics ? never() : Promise.resolve({ error: null });
          },
          select: logsQuery.select,
        };
      }

      const query = {
        select(value: string) { columns = value; return query; },

        order() { return query; },
        limit() { return query; },
        range(start: number, end: number) {
          range = { start, end };
          mocks.ranges.push({ table, start, end });
          return query;
        },
        insert(
          value: { movie_id: number } | Array<{ movie_id: number }>,
          options?: Record<string, unknown>,
        ) {
          const rows = Array.isArray(value) ? value : [value];
          if (Array.isArray(value) && mocks.failBatch) {
            // Postgres rejects a multi-row insert atomically: no partial success.
            pending = null;
            return {
              select: () => Promise.resolve({ data: null, error: { message: "constraint" } }),
            };
          }
          if (Array.isArray(value)) mocks.batchInsertOptions = options ?? null;
          mocks.recWrites.push(rows.map((r) => ({
            movie_id: r.movie_id,
            reason: (r as unknown as { reason: string }).reason,
            obscurity: (r as unknown as { obscurity: number }).obscurity,
          })));
          pending = rows.map((r) => ({ movie_id: r.movie_id }));
          return query;
        },
        upsert(
          value: { movie_id: number } | Array<{ movie_id: number }>,
          options?: Record<string, unknown>,
        ) {
          // supabase's upsert(rows, { onConflict, ignoreDuplicates }) is the
          // batch write persistRecs uses — identical mock behaviour to insert.
          return query.insert(value as { movie_id: number }, options);
        },
        delete() {
          mocks.deletes.push({ table });
          if (!mocks.failDelete) return query;
          // A delete outage: chained .eq() calls still resolve, but awaiting the
          // chain rejects — exactly what supabase-js does when the request fails.
          const dead = {
            eq() { return dead; },
            then(_ok: unknown, bad: (e: unknown) => unknown) {
              return Promise.reject(new Error("delete unavailable")).then(null, bad);
            },
          };
          return dead;
        },
        eq(column: string, value: unknown) {
          const last = mocks.deletes[mocks.deletes.length - 1];
          if (last && column === "movie_id") last.movieId = value as number;
          return query;
        },
        async single() {
          const last = pending?.[pending.length - 1];
          pending = null;
          if (last && mocks.insertErrors[last.movie_id]) {
            return { data: null, error: { code: mocks.insertErrors[last.movie_id], message: "private detail" } };
          }
          return { data: last ? { id: `rec-${last.movie_id}` } : null, error: null };
        },
        async maybeSingle() {
          return { data: table === "taste_profiles"
            ? { threads: [{ title: "Drama", line: "Character stories" }] }
            : { batch: mocks.lastBatch } };
        },
        then(resolve: (value: { data: unknown[] }) => unknown) {
          if (pending) {
            const rows = pending.map((r) => ({ id: `rec-${r.movie_id}`, movie_id: r.movie_id }));
            pending = null;
            return Promise.resolve({ data: rows, error: null }).then(resolve);
          }
          if (range) {
            if (mocks.historyFailure && range.start > 0) {
              return Promise.resolve({ data: null, error: { message: "private detail" } }).then(resolve as (value: unknown) => unknown);
            }
            const rows = mocks.history[table] ?? [];
            return Promise.resolve({
              data: rows.slice(range.start, Math.min(range.end + 1, range.start + mocks.historyCap)),
              count: rows.length, error: null,
            }).then(resolve);
          }
          // The loved films feed two different reads: the briefs carry an
          // overview (they go to the prompt), the exclusion read does not.
          const data = table === "loved_movies"
            ? columns.includes("overview")
              ? mocks.lovedBriefs
              : (mocks.history.loved_movies ?? [])
            : table === "user_services" ? mocks.services : (mocks.history[table] ?? []);
          return Promise.resolve({ data: data.slice(0, mocks.unpagedHistoryCap) }).then(resolve);
        },
      };
      return query;
    },
  }),
}));

import { dealRecs } from "@/lib/engine";
import { dealRecs as baselineDealRecs } from "./fixtures/engine-before-speed";

/** The frozen deal every assertion below is written against. */
function freezeScenario() {
  mocks.events.length = 0;
  mocks.recWrites.length = 0;
  mocks.logWrites = 0;
  mocks.failBatch = false;
  mocks.batchInsertOptions = null;
  mocks.hangDiagnostics = false;
  mocks.lovedBriefs = [{
    movie_id: 900,
    movies: { id: 900, title: "Loved seed", year: 2000, genres: ["Drama"], overview: "A film they loved." },
  }];
  mocks.history = { loved_movies: [{ movie_id: 900, movies: { title: "Loved seed", year: 2000 } }] };
  mocks.historyCap = 500;
  mocks.unpagedHistoryCap = Infinity;
  mocks.keywordIds = [];
  mocks.lastBatch = 0;
  mocks.services = [];
  mocks.aiLogs = [];
  mocks.logReadError = false;
  mocks.logSignal = null;
  mocks.historyFailure = false;
  mocks.ranges.length = 0;
  mocks.insertErrors = {};
  mocks.deletes.length = 0;
  mocks.failDelete = false;
  mocks.discoverMovies.mockResolvedValue([]);

  // Candidates covering every gate: two that land, one too famous, one invented,
  // one musty classic too far, one the member already loves, one the model
  // repeats.
  mocks.generateRecCandidates.mockImplementation(async () => {
    mocks.events.push("llm:start");
    await new Promise((r) => setTimeout(r, 5));
    mocks.events.push("llm:end");
    return {
      raw: "mock output",
      candidates: {
        recs: [
          { title: "11", year: 2000, reason: "Taste match on 11" },
          { title: "12", year: 2000, reason: "Famous, must be gated out" },
          { title: "Hallucination", year: 2000, reason: "Invented" },
          { title: "13", year: 1965, reason: "One allowed classic" },
          { title: "14", year: 1968, reason: "Second classic, must be gated out" },
          { title: "Already loved", year: 2000, reason: "The member's own" },
          { title: "11", year: 2000, reason: "Repeated by the model" },
        ],
      },
    };
  });

  mocks.getSimilarMovies.mockImplementation(async (id: number) => {
    mocks.events.push("similar:graph");
    // Includes a duplicate neighbour, which the dedupe must absorb.
    return id === 900
      ? [{ id: 100 }, { id: 101 }, { id: 102 }, { id: 103 }, { id: 104 }, { id: 102 }]
      : [];
  });

  mocks.cacheMovie.mockImplementation(async (id: number) => {
    mocks.events.push(`similar:cache:${id}`);
    if (id === 100) throw new Error("lookup failed");
    return {
      id, title: `Movie ${id}`, genres: ["Drama"],
      // The year is TMDB's, not the candidate's — so the classic cap has to be
      // exercised through what the cache reports.
      year: id === 13 ? 1965 : id === 14 ? 1968 : 2000,
      // 30000 votes is a household name; 400 is a genuine deep cut.
      vote_count: id === 12 ? 30_000 : 400,
      imdb_votes: null, providers: {},
      ratings: { imdb: 7, tmdb: 7, rt: null },
    };
  });

  mocks.track.mockImplementation(async () => {
    if (mocks.hangDiagnostics) return new Promise(() => {});
    return undefined;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  freezeScenario();
});
afterEach(() => vi.restoreAllMocks());

const deal = () =>
  dealRecs("mock-user", { obscurityMin: 3, obscurityMax: 5, myServicesOnly: false });

const timingRecord = () =>
  JSON.parse(String(vi.mocked(console.info).mock.calls[0][1])) as {
    outcome: string;
    stagesMs: Record<string, number>;
    meta?: Record<string, string | number | boolean>;
  };

describe("dealRecs — the deal is unchanged by the speed work", () => {
  it("matches the actual pre-speed engine's seeds, IDs, reasons and scores with eight loved films", async () => {
    async function replay(engine: typeof dealRecs) {
      vi.clearAllMocks();
      freezeScenario();
      // Newest-first input, as returned by getLovedBriefs in BOTH engines.
      mocks.lovedBriefs = Array.from({ length: 8 }, (_, i) => ({
        movie_id: 900 + i,
        movies: { id: 900 + i, title: i === 0 ? "Se7en" : `Loved seed ${i}`,
          year: 2000, genres: ["Drama"], overview: "Frozen loved-film evidence." },
      }));
      mocks.history.loved_movies = mocks.lovedBriefs;
      // Snapshot at invocation: both engines mutate exclusionTitles afterward.
      let prompt: unknown;
      const generate = mocks.generateRecCandidates.getMockImplementation()!;
      mocks.generateRecCandidates.mockImplementation((...args) => {
        prompt = structuredClone(args[0]);
        return generate(...args);
      });
      // Every seed has distinct candidates: a seed change must change the output.
      mocks.getSimilarMovies.mockImplementation(async (id: number) =>
        [0, 1, 2].map((offset) => ({ id: 1000 + (id - 900) * 10 + offset })));
      const recs = await engine("mock-user", {
        obscurityMin: 4, obscurityMax: 5, myServicesOnly: false,
      });
      return {
        recs,
        seeds: mocks.getSimilarMovies.mock.calls.map(([id, page]) => [id, page]),
        prompt,
        // SQL batching differs intentionally; compare persisted content, not calls.
        writes: mocks.recWrites.flat(),
      };
    }
    const baseline = await replay(baselineDealRecs);
    const current = await replay(dealRecs);
    expect(current).toEqual(baseline);
    expect(current.seeds).toEqual([900, 901, 902, 903, 904, 905].map((id) => [id, 1]));
    expect(current.recs.map((r) => r.movieId)).toEqual([11, 13, 1000, 1001, 1002]);
    expect(current.recs.slice(2).map((r) => r.reason)).toEqual(Array(3).fill(
      "Because you loved Se7en — a deeper cut in the same vein, 2000.",
    ));
  });

  it("documents the one known divergence: a failed classic write costs the slot", async () => {
    // The pre-speed engine gated and persisted each candidate in one interleaved
    // loop, so a classic whose insert failed never consumed the batch's single
    // pre-1970 slot — the next classic (14) took it. The optimized engine gates
    // every candidate first and persists in one statement afterwards, so the
    // slot is provisionally spent at gate time and a failed write means one
    // fewer film instead of a substitution. Restoring the old behaviour here
    // would mean per-row inserts on every deal (~0.5–1s) to fix a path that
    // only triggers on a genuine database error — upsert+ignoreDuplicates
    // already makes the common duplicate case succeed silently. Documented,
    // not hidden: if this trade ever matters, restore the interleaved loop.
    async function replay(engine: typeof dealRecs) {
      vi.clearAllMocks();
      freezeScenario();
      mocks.failBatch = true;
      mocks.insertErrors[13] = "23505";
      return engine("mock-user", {
        obscurityMin: 3, obscurityMax: 5, myServicesOnly: false,
      });
    }
    const baseline = await replay(baselineDealRecs);
    expect(baseline.map((r) => r.movieId)).toEqual([11, 14, 101, 102, 103]);
    const current = await replay(dealRecs);
    expect(current.map((r) => r.movieId)).toEqual([11, 101, 102, 103]);
  });

  it.each(["mind", "weird"])("preserves %s output when old history is capped and repeated picks hit SQL uniqueness", async (vibe) => {
    // Production evidence: 11 of batch 214's 12 proposed titles matched July
    // recommendations. This synthetic replay isolates that mechanism; it is not
    // a reconstruction of the unrecorded historical TMDB responses or dial.
    async function replay(engine: typeof dealRecs) {
      vi.clearAllMocks();
      freezeScenario();
      mocks.unpagedHistoryCap = 1000;
      mocks.keywordIds = [123];
      const repeats = Array.from({ length: 11 }, (_, i) => 2000 + i);
      mocks.history.recommendations = [...Array.from({ length: 1000 }, (_, i) => 3000 + i), ...repeats]
        .map((movie_id) => ({ movie_id, movies: { title: String(movie_id), year: 2000 } }));
      for (const id of repeats) mocks.insertErrors[id] = "23505";
      mocks.generateRecCandidates.mockResolvedValue({
        raw: "synthetic repeat-heavy completion",
        candidates: { recs: [...repeats.map(String), "Hallucination"].map((title) => ({
          title, year: 2000, reason: "Synthetic candidate",
        })) },
      });
      // Every keyword page contains only old recommendations. The old engine
      // enriches them and SQL rejects them; the new engine excludes them early.
      mocks.discoverMovies.mockResolvedValue(repeats.map((id) => ({ id })));
      const recs = await engine("mock-user", {
        obscurityMin: 4, obscurityMax: 5, myServicesOnly: false, vibe,
      });
      // The vault's sort strategy is deliberate post-speed policy (deepest-cut-
      // first), not part of what "unchanged by the speed work" pins — so it is
      // normalized out of the request comparison. Every other request field
      // (band, keywords, genres, budget) stays pinned.
      const requests = structuredClone(mocks.discoverMovies.mock.calls)
        .map(([opts]) => [{ ...opts, sortBy: "normalized" }]);
      return { recs, requests };
    }
    const baseline = await replay(baselineDealRecs);
    const current = await replay(dealRecs);
    // What the speed work must not change: the films, in the same order.
    expect(current.recs).toEqual(baseline.recs);
    expect(current.recs.map((r) => r.movieId)).toEqual([101, 102, 103]);
    // What IS deliberate new policy, pinned directly rather than against the
    // baseline engine: the shared 6-page budget reserves a page for each
    // pool-changing widener, and a widener opens on page 1 — the page that
    // actually holds a narrow pool — instead of rotating onto an empty one.
    // Before the reserve these wideners were unreachable: every budgeted fetch
    // carried the vibe keyword, which is the exact shape the live preview's
    // attempt trail recorded at batch 212-216.
    expect(current.requests).toHaveLength(6);
    expect(current.requests.map(([opts]) => opts.page)).toEqual([1, 2, 3, 1, 1, 1]);
    // The keyword-carrying attempts run first, then the genre net with no keyword.
    expect(current.requests.slice(0, 5).every(([opts]) => opts.keywordIds?.[0] === 123)).toBe(true);
    expect(current.requests[5][0].keywordIds).toBeUndefined();
    expect(current.requests[5][0].genreIds).toBeDefined();
    // Keyword-only attempts for tone vibes keep the vibe's genreIds ANDed in,
    // so stand-up comedy never lands on "Melt my brain".
    expect(current.requests[3][0].genreIds).toBeDefined();
  });

  it.each(["mind", "weird"])("preserves fresh %s keyword fallback picks and their order", async (vibe) => {
    async function replay(engine: typeof dealRecs) {
      vi.clearAllMocks();
      freezeScenario();
      mocks.keywordIds = [123];
      mocks.generateRecCandidates.mockResolvedValue({
        raw: "synthetic excluded completion",
        candidates: { recs: [{ title: "Already loved", year: 2000, reason: "Repeat" }] },
      });
      mocks.discoverMovies.mockResolvedValueOnce([301, 302, 303, 304, 305].map((id) => ({ id })));
      const recs = await engine("mock-user", {
        obscurityMin: 4, obscurityMax: 5, myServicesOnly: false, vibe,
      });
      // Same normalization as above: the vault sort is deliberate new policy.
      const requests = structuredClone(mocks.discoverMovies.mock.calls)
        .map(([opts]) => [{ ...opts, obscurityMin: 3, sortBy: "normalized" }]);
      return { recs, requests };
    }
    const baseline = await replay(baselineDealRecs);
    const current = await replay(dealRecs);
    expect(current).toEqual(baseline);
    expect(current.recs.map((r) => r.movieId)).toEqual([101, 102, 103, 301, 302, 303, 304, 305]);
    expect(current.recs.slice(3).every((r) => r.reason.startsWith("Vault pull"))).toBe(true);
    expect(current.requests).toHaveLength(1);
  });

  it("deals the same films, in the same order, with the same reasons", async () => {
    const recs = await deal();

    // Every gate still does its job: the too-famous film, the invented one, the
    // second pre-1970 film, the member's own loved film and the model's repeat
    // are all absent; the loved-similar pass contributes exactly three.
    expect(recs.map((r) => r.movieId)).toEqual([11, 13, 101, 102, 103]);
    expect(recs.map((r) => r.obscurity)).toEqual([5, 5, 5, 5, 5]);
    const deeperCut =
      "Because you loved Loved seed — a deeper cut in the same vein, 2000.";
    expect(recs.map((r) => r.reason)).toEqual([
      "Taste match on 11",
      "One allowed classic",
      deeperCut,
      deeperCut,
      deeperCut,
    ]);
    // The failing lookup and the duplicate neighbour were never dealt.
    expect(recs.map((r) => r.movieId)).not.toContain(100);
    expect(recs.map((r) => r.movieId)).not.toContain(104);
    // Never re-dealt: the exclusion set is enforced before TMDB is even asked.
    expect(mocks.cacheMovie.mock.calls.map(([id]) => id)).not.toContain(900);
  });

  it("starts the loved-similar enrichment before the model answers", async () => {
    await deal();

    // The overlap is the whole point of the change: the graph pull and the first
    // enrichments happen while the model is still generating, not after it.
    const llmEnd = mocks.events.indexOf("llm:end");
    expect(mocks.events.indexOf("similar:graph")).toBeLessThan(llmEnd);
    expect(mocks.events.indexOf("similar:cache:101")).toBeLessThan(llmEnd);
  });

  it("writes the model's survivors in one statement", async () => {
    await deal();

    // First write is the batch of survivors from the model's round…
    expect(mocks.recWrites[0].map((r) => r.movie_id)).toEqual([11, 13]);
    // …and the loved-similar pass still writes its three one at a time, in graph
    // order, because its gate loop decides as it goes.
    expect(mocks.recWrites.slice(1).map((w) => w[0].movie_id)).toEqual([101, 102, 103]);
  });

  it("skips duplicates inside the batch statement instead of rejecting it", async () => {
    await deal();

    // The production failure mode: one repeat title used to violate the
    // (user_id, movie_id) unique constraint, Postgres rejected the whole
    // multi-row insert, and the fallback re-wrote every film one by one. The
    // write now declares ON CONFLICT DO NOTHING (supabase's
    // upsert + ignoreDuplicates), so the duplicate is absorbed in the same
    // round trip — and the timing log proves which path ran.
    expect(mocks.batchInsertOptions).toMatchObject({
      onConflict: "user_id,movie_id",
      ignoreDuplicates: true,
    });
    const record = timingRecord();
    expect(record.meta?.persist_path).toBe("batch");
  });

  it("falls back to one row at a time when the batch insert is rejected", async () => {
    mocks.failBatch = true;
    const recs = await deal();

    // A rolled-back batch must not cost the deal its films: the same survivors
    // land, written individually — and the log says so, because per_row_fallback
    // from here on means a real database problem, not a duplicate title.
    expect(recs.map((r) => r.movieId)).toEqual([11, 13, 101, 102, 103]);
    expect(mocks.recWrites.map((w) => w[0].movie_id)).toEqual([11, 13, 101, 102, 103]);
    expect(timingRecord().meta?.persist_path).toBe("per_row_fallback");
  });

  it("explains the LLM stage instead of only timing it", async () => {
    await deal();

    // How long is not enough to fix it — this is what says whether the ten
    // seconds were a slow generation or a rate-limited walk down the fallback
    // chain, which have opposite fixes.
    const record = timingRecord();
    expect(record.outcome).toBe("success");
    expect(record.meta).toMatchObject({
      llm_model: "openai/gpt-oss-120b",
      llm_requests: 3,
      llm_models_tried: 2,
      llm_repaired: true,
      llm_waited_ms: 4000,
    });
    expect(typeof record.meta?.similar_ready_before_selection).toBe("number");
    expect(record.meta?.similar_candidates_consumed).toBe(4);
    expect(record.meta?.similar_enrichment_failed).toBe(1);
    expect(record.meta?.similar_added).toBe(3);
    expect(typeof record.meta?.similar_enrichment_wait_ms).toBe("number");
    expect(typeof record.meta?.similar_insert_ms).toBe("number");
  });

  it("preserves gates and order beyond the old prefetch window", async () => {
    const original = mocks.cacheMovie.getMockImplementation()!;
    mocks.getSimilarMovies.mockResolvedValue([
      ...Array.from({ length: 10 }, (_, i) => ({ id: 200 + i })),
      { id: 11 }, { id: 14 }, { id: 101 }, { id: 102 }, { id: 103 },
    ]);
    mocks.cacheMovie.mockImplementation(async (id: number) => {
      const movie = await original(id);
      if (id >= 200 && id < 210) return { ...movie, vote_count: 30_000 };
      return movie;
    });
    const recs = await deal();
    expect(recs.map((r) => r.movieId)).toEqual([11, 13, 101, 102, 103]);
    expect(recs.slice(2).map((r) => r.reason)).toEqual(Array(3).fill(
      "Because you loved Loved seed — a deeper cut in the same vein, 2000.",
    ));
    expect(timingRecord().meta).toMatchObject({
      similar_candidates_consumed: 15,
      similar_out_of_band: 10,
      // Both appeared in the LLM pass: 11 was saved and 14 was gated out.
      // Both therefore hit exclusions before the similar pass's classic gate.
      similar_excluded: 2,
      similar_classic: 0,
      similar_added: 3,
    });
    expect(mocks.generateRecCandidates).toHaveBeenCalledTimes(1);
  });

  it.each(["loved_movies", "watch_logs", "recommendations"])(
    "reads all %s history beyond 1,000 rows even with a smaller server cap", async (table) => {
      mocks.historyCap = 200;
      let promptTitleCount = 0;
      const generate = mocks.generateRecCandidates.getMockImplementation()!;
      mocks.generateRecCandidates.mockImplementation(async (...args) => {
        promptTitleCount = args[0].exclusionTitles.length;
        return generate(...args);
      });
      mocks.history[table] = [
        ...Array.from({ length: 1200 }, (_, i) => ({ movie_id: i === 0 ? 900 : 2000 + i, movies: { title: `History ${i}`, year: 2000 } })),
        { movie_id: 101, movies: { title: "Old recommendation", year: 2000 } },
      ];
      const recs = await deal();
      expect(recs.map((r) => r.movieId)).toEqual([11, 13, 102, 103, 104]);
      expect(mocks.cacheMovie).not.toHaveBeenCalledWith(101);
      expect(mocks.ranges.filter((r) => r.table === table).map((r) => r.start))
        .toEqual([0, 200, 400, 600, 800, 1000, 1200]);
      expect(promptTitleCount).toBe(120);
      expect(timingRecord().meta?.similar_lookups_skipped_excluded).toBe(1);
    },
  );

  it("does not generate or persist when a later history page fails", async () => {
    mocks.historyCap = 1;
    mocks.historyFailure = true;
    mocks.history.recommendations = [101, 102].map((movie_id) => ({
      movie_id, movies: { title: "History", year: 2000 },
    }));
    await expect(deal()).rejects.toThrow("Could not load recommendation exclusions");
    expect(mocks.generateRecCandidates).not.toHaveBeenCalled();
    expect(mocks.cacheMovie).not.toHaveBeenCalled();
    expect(mocks.recWrites).toEqual([]);
    expect(timingRecord().outcome).toBe("error");
  });

  it("skips enrichment for IDs excluded by the LLM before later lookahead starts", async () => {
    mocks.getSimilarMovies.mockResolvedValue([
      ...Array.from({ length: 8 }, (_, i) => ({ id: 200 + i })),
      { id: 11 }, { id: 14 }, { id: 101 }, { id: 102 }, { id: 103 },
    ]);
    const original = mocks.cacheMovie.getMockImplementation()!;
    mocks.cacheMovie.mockImplementation(async (id: number) => {
      const movie = await original(id);
      return id >= 200 && id < 208 ? { ...movie, vote_count: 30_000 } : movie;
    });
    const recs = await deal();
    expect(recs.map((r) => r.movieId)).toEqual([11, 13, 101, 102, 103]);
    // The LLM fixture repeats 11 (two validations); neither ID is enriched again.
    expect(mocks.cacheMovie.mock.calls.filter(([id]) => id === 11)).toHaveLength(2);
    expect(mocks.cacheMovie.mock.calls.filter(([id]) => id === 14)).toHaveLength(1);
    expect(timingRecord().meta).toMatchObject({
      similar_excluded: 2, similar_lookups_skipped_excluded: 2,
      similar_lookups_started: 11, similar_candidates_consumed: 13,
      similar_unused_lookups: 0,
    });
  });

  it("records safe insert codes and still finds three similar survivors after a failure", async () => {
    mocks.insertErrors[101] = "23505";
    const recs = await deal();
    expect(recs.map((r) => r.movieId)).toEqual([11, 13, 102, 103, 104]);
    expect(timingRecord().meta).toMatchObject({ similar_insert_error_23505: 1, similar_insert_failed: 1, similar_added: 3 });
    expect(JSON.stringify(timingRecord())).not.toContain("private detail");
  });

  it("fills the slate from a reserved page-1 widener after empty batch-214 pages", async () => {
    mocks.lastBatch = 213;
    mocks.services = [{ service: "tubi" }];
    mocks.keywordIds = [9887];
    mocks.generateRecCandidates.mockResolvedValue({ raw: "mock", candidates: { recs: [] } });
    mocks.getSimilarMovies.mockResolvedValue([]);
    mocks.discoverMovies.mockImplementation(async (opts) =>
      opts.services?.length ? [] : [{ id: 301 }]);

    const recs = await dealRecs("mock-user", {
      obscurityMin: 4, obscurityMax: 5, myServicesOnly: true, vibe: "weird",
    });
    expect(recs.map((r) => r.movieId)).toEqual([301]);
    expect(recs[0].reason).toContain("Vault pull");
    const requests = mocks.discoverMovies.mock.calls.map(([opts]) => opts);
    // The budget is still 6 pages; what changed is how they are spent. Batch 214
    // rotates onto page 4, which is past the end of a narrow pool, so each
    // services-on attempt pays a page-4 fetch plus its page-1 retry — and then
    // the two reserved widener pages open directly on page 1 and fill the slate.
    // Before the reserve the tail of the budget was two more same-pool crawls
    // (pages 4 and 5), which is where the live preview's dead end came from.
    expect(requests).toHaveLength(6);
    expect(requests.map((opts) => opts.page)).toEqual([1, 1, 1, 5, 1, 1]);
    // Page 1 is tried first now (no more page-4 start), so every attempt
    // opens on page 1. Services-on attempts first (each empty), then the
    // services-off wideners that fill the slate.
    expect(requests.slice(0, 2).every((opts) => opts.services?.includes("tubi"))).toBe(true);
    expect(requests.slice(2).every((opts) => opts.services === undefined)).toBe(true);
    for (const opts of requests.slice(0, 5)) {
      expect(opts).toMatchObject({
        obscurityMin: 3, obscurityMax: 5, keywordIds: [9887],
        withoutGenreIds: [10751, 16], sortBy: "vote_average.desc",
        minVotes: 300, minRating: 5.5, region: "US",
      });
    }
    // The final widener is the vibe's genre net: pool-changing and keyword-free.
    expect(requests[5]).toMatchObject({
      obscurityMin: 3, obscurityMax: 5, genreIds: [14, 878, 27],
      withoutGenreIds: [10751, 16], sortBy: "vote_average.desc",
      minVotes: 300, minRating: 5.5, region: "US",
    });
    expect(requests[5].keywordIds).toBeUndefined();
    // Repeated results on later pages must not be enriched or dealt again.
    expect(mocks.cacheMovie).toHaveBeenCalledTimes(1);
  });

it("reaches both pool-changing wideners when the rotated pages are empty and page 1 is all excluded", async () => {
    // The live preview's attempt trail at batch 212-216, exactly: rotation lands
    // on pages 10-11, a narrow pool returns nothing there, and every film on
    // page 1 is already in the member's exclusion history. All six budgeted
    // fetches came back still carrying all five vibe keywords, so neither
    // widener — the rotated single-keyword pull, nor the genre net with no
    // keyword — ever ran and the slate went unfilled. This pins that the
    // reserved pages make them reachable, which is what the caveat was about.
    mocks.lastBatch = 211; // batch 212 rotates onto page 10, as the trail shows
    mocks.services = [{ service: "tubi" }];
    mocks.keywordIds = [9887, 374649, 367333, 312814, 308818];
    mocks.generateRecCandidates.mockResolvedValue({ raw: "mock", candidates: { recs: [] } });
    mocks.getSimilarMovies.mockResolvedValue([]);
    mocks.history.recommendations = [{ movie_id: 7777, movies: { title: "Seen", year: 2000 } }];
    mocks.discoverMovies.mockImplementation(async (opts) => {
      if (opts.page !== 1) return []; // pages 10-12 are past the end of a narrow pool
      if (opts.keywordIds?.length === 1) return [{ id: 501 }]; // rotated-keyword widener
      if (!opts.keywordIds && opts.genreIds) return [{ id: 502 }]; // genre-net widener
      return [{ id: 7777 }]; // the core page-1 pull: every film already excluded
    });

    const recs = await dealRecs("mock-user", {
      obscurityMin: 3, obscurityMax: 5, myServicesOnly: true, vibe: "weird",
    });

    const requests = mocks.discoverMovies.mock.calls.map(([opts]) => opts);
    // The budget is unchanged at 6 pages — the reserve only re-spends them.
    expect(requests).toHaveLength(6);
    const wideners = requests.filter(
      (opts) => !opts.services && (opts.keywordIds?.length === 1 || !opts.keywordIds),
    );
    expect(wideners).toHaveLength(2);
    // A widener opens on page 1: the page that actually holds a narrow pool.
    expect(wideners.every((opts) => opts.page === 1)).toBe(true);
    // Rotated single-keyword focus (batch 212 -> the second keyword), then the
    // vibe's genre net with no keyword at all.
    expect(wideners[0]).toMatchObject({ page: 1, keywordIds: [374649] });
    expect(wideners[1]).toMatchObject({ page: 1, genreIds: [14, 878, 27] });
    expect(wideners[1].keywordIds).toBeUndefined();
    // Both widened pools reached the slate, which is the point of the reserve.
    expect(recs.map((r) => r.movieId)).toEqual([501, 502]);
    expect((timingRecord().meta as Record<string, number>).discover_pages).toBe(6);
  });
  it("retries from page 1 when a narrow search page is empty at a high batch number", async () => {
    // Regression: batch 214+ used to start page rotation at page 4. A narrow vibe
    // search with only 1-2 pages of results looked empty from page 4, so the
    // vault was abandoned. Page 1 is now tried first (p === 0), so a narrow pool
    // is found immediately instead of being missed.
    mocks.lastBatch = 213;
    mocks.services = [{ service: "tubi" }];
    mocks.keywordIds = [9887];
    mocks.generateRecCandidates.mockResolvedValue({ raw: "mock", candidates: { recs: [] } });
    mocks.getSimilarMovies.mockResolvedValue([]);
    mocks.discoverMovies.mockImplementation(async (opts) =>
      opts.page === 1 && opts.services?.length ? [{ id: 302 }] : []);

    const recs = await dealRecs("mock-user", {
      obscurityMin: 4, obscurityMax: 5, myServicesOnly: true, vibe: "weird",
    });
    // Page 1 is tried first now, so the film is dealt on the first attempt.
    expect(recs.map((r) => r.movieId)).toContain(302);
    expect(recs.find((r) => r.movieId === 302)?.reason).toContain("Vault pull");
    const requests = mocks.discoverMovies.mock.calls.map(([opts]) => opts);
    expect(requests.length).toBeGreaterThanOrEqual(1);
    expect(requests[0].page).toBe(1);
    expect(requests[0]).toMatchObject({
      obscurityMin: 3, obscurityMax: 5, keywordIds: [9887],
      services: ["tubi"], region: "US",
    });
  });


  it("recycles a stale, unengaged recommendation back into the deal", async () => {
    // Just dealt, never touched: not a verdict, so it is immediately offered
    // again. Recycled titles must also be removed from the LLM's title list.
    mocks.history.recommendations = [{
      movie_id: 601, movies: { title: "Stale pick", year: 2000 },
      id: "rec-601", status: "active", created_at: new Date().toISOString(),
    }] as unknown as typeof mocks.history.recommendations;
    mocks.getSimilarMovies.mockResolvedValue([]);
    mocks.discoverMovies.mockResolvedValue([{ id: 601 }]);
    let promptTitles: string[] = [];
    const generate = mocks.generateRecCandidates.getMockImplementation()!;
    mocks.generateRecCandidates.mockImplementation(async (...args) => {
      promptTitles = [...args[0].exclusionTitles];
      return generate(...args);
    });
    const recs = await dealRecs("mock-user", {
      obscurityMin: 3, obscurityMax: 5, myServicesOnly: false,
    });
    expect(recs.map((r) => r.movieId)).toContain(601);
    expect(promptTitles).not.toContain("Stale pick (2000)");
    expect(mocks.deletes).toEqual([{ table: "recommendations", movieId: 601 }]);
  });

  it("keeps the less-seen floor when a legacy client requests a lower tier", async () => {
    mocks.generateRecCandidates.mockResolvedValue({ raw: "mock", candidates: { recs: [] } });
    mocks.getSimilarMovies.mockResolvedValue([]);
    mocks.discoverMovies.mockResolvedValue([]);
    await dealRecs("mock-user", {
      obscurityMin: 1, obscurityMax: 5, myServicesOnly: false,
    });
    expect(mocks.generateRecCandidates.mock.calls[0][0].obscurityMin).toBe(3);
    expect(mocks.discoverMovies.mock.calls.length).toBeGreaterThan(0);
    expect(mocks.discoverMovies.mock.calls.every(([opts]) => opts.obscurityMin === 3)).toBe(true);
  });

  it("rejects comedy leaks for Melt my brain from LLM, similar, and Discover", async () => {
    mocks.generateRecCandidates.mockResolvedValue({
      raw: "mock",
      candidates: { recs: [{ title: "7201", year: 2000, reason: "Comedy leak" }] },
    });
    mocks.getSimilarMovies.mockResolvedValue([{ id: 7202 }]);
    mocks.discoverMovies.mockResolvedValue([{ id: 7203 }]);
    const cache = mocks.cacheMovie.getMockImplementation()!;
    mocks.cacheMovie.mockImplementation(async (id: number) => {
      const movie = await cache(id);
      return [7201, 7202, 7203].includes(id) ? { ...movie, genres: ["Comedy"] } : movie;
    });

    const recs = await dealRecs("mock-user", {
      obscurityMin: 4, obscurityMax: 5, myServicesOnly: false, vibe: "mind",
    });

    for (const movieId of [7201, 7202, 7203]) {
      expect(recs.map((r) => r.movieId)).not.toContain(movieId);
    }
    expect(mocks.cacheMovie.mock.calls.map(([id]) => id)).toEqual(
      expect.arrayContaining([7201, 7202, 7203]),
    );
  });

  it("engaged recommendations are never recycled", async () => {
    mocks.history.recommendations = [{
      movie_id: 602, movies: { title: "Watchlisted", year: 2000 },
      id: "rec-602", status: "watchlisted", created_at: "2020-01-01T00:00:00Z",
    }] as unknown as typeof mocks.history.recommendations;
    mocks.discoverMovies.mockResolvedValue([{ id: 602 }]);
    const recs = await dealRecs("mock-user", {
      obscurityMin: 3, obscurityMax: 5, myServicesOnly: false,
    });
    expect(recs.map((r) => r.movieId)).not.toContain(602);
    expect(mocks.deletes).toEqual([]);
  });

  it("keeps an explicit not-for-me dismissal out of every later deal", async () => {
    mocks.history.recommendations = [{
      movie_id: 603, movies: { title: "Rejected pick", year: 2000 },
      id: "rec-603", status: "dismissed", created_at: new Date().toISOString(),
    }] as unknown as typeof mocks.history.recommendations;
    mocks.getSimilarMovies.mockResolvedValue([]);
    mocks.discoverMovies.mockResolvedValue([{ id: 603 }]);
    const recs = await dealRecs("mock-user", {
      obscurityMin: 3, obscurityMax: 5, myServicesOnly: false,
    });
    expect(recs.map((r) => r.movieId)).not.toContain(603);
    expect(mocks.deletes).toEqual([]);
  });

  it("keeps dealing when the recycling delete fails", async () => {
    // A delete outage must not sink the batch. The stale row simply still sits
    // behind the unique (user_id, movie_id) constraint, so only that one
    // re-deal is lost — counted like any other insert failure.
    mocks.history.recommendations = [{
      movie_id: 601, movies: { title: "Stale pick", year: 2000 },
      id: "rec-601", status: "active", created_at: "2020-01-01T00:00:00Z",
    }] as unknown as typeof mocks.history.recommendations;
    mocks.failDelete = true;
    mocks.getSimilarMovies.mockResolvedValue([]);
    mocks.discoverMovies.mockResolvedValue([{ id: 601 }]);
    const recs = await dealRecs("mock-user", {
      obscurityMin: 3, obscurityMax: 5, myServicesOnly: false,
    });
    expect(mocks.deletes.length).toBeGreaterThan(0);
    // The rest of the slate is untouched by the failure.
    expect(recs.map((r) => r.movieId)).toEqual(expect.arrayContaining([11, 13]));
    expect(timingRecord().meta).toMatchObject({ recycle_failed: 1 });
  });

  it("widens the vault pool with a rotated keyword and the genre net when the keyword pool runs dry", async () => {
    // Tone vibes drop bare-genre attempts deliberately; once the OR-union
    // keyword pool is drained (heavy member), the deal must still be able to
    // widen: first a rotated single-keyword focus (batch 1 -> the first
    // keyword), then the vibe genre net without keywords.
    mocks.lastBatch = 0;
    mocks.keywordIds = [9887, 9256];
    mocks.generateRecCandidates.mockResolvedValue({ raw: "mock", candidates: { recs: [] } });
    mocks.getSimilarMovies.mockResolvedValue([]);
    mocks.discoverMovies.mockImplementation(async (opts) =>
      opts.keywordIds?.length ? [] : [{ id: 301 }]);
    const recs = await dealRecs("mock-user", {
      obscurityMin: 3, obscurityMax: 5, myServicesOnly: false, vibe: "weird",
    });
    expect(recs.map((r) => r.movieId)).toEqual([301]);
    const requests = mocks.discoverMovies.mock.calls.map(([opts]) => opts);
    expect(requests.some((o) => o.keywordIds && o.keywordIds.length > 1)).toBe(true);
    expect(requests.some((o) => o.keywordIds?.length === 1 && o.keywordIds![0] === 9887)).toBe(true);
    const last = requests[requests.length - 1];
    expect(last.keywordIds).toBeUndefined();
    expect(last.genreIds).toBeDefined();
  });

  it("reaches every widener and stays inside the shared page budget when the vault is dry", async () => {
    // The page budget is shared by every attempt, so widening must never become
    // an unbounded crawl. An empty attempt costs one page and falls through to
    // the next configuration, so a fully drained vault still walks the whole
    // attempt list - and then stops.
    mocks.lastBatch = 0;
    mocks.keywordIds = [9887, 9256];
    mocks.generateRecCandidates.mockResolvedValue({ raw: "mock", candidates: { recs: [] } });
    mocks.getSimilarMovies.mockResolvedValue([]);
    mocks.discoverMovies.mockResolvedValue([]);
    await dealRecs("mock-user", {
      obscurityMin: 3, obscurityMax: 5, myServicesOnly: false, vibe: "weird",
    });
    const requests = mocks.discoverMovies.mock.calls.map(([opts]) => opts);
    // union -> union keywords -> pure keyword-only -> rotated keyword -> genre net, one page each.
    expect(requests.length).toBe(5);
    expect(requests[0].keywordIds).toEqual([9887, 9256]);
    expect(requests[1].keywordIds).toEqual([9887, 9256]);
    expect(requests[2].keywordIds).toEqual([9887, 9256]);
    expect(requests[2].genreIds).toBeUndefined();
    expect(requests[3].keywordIds).toEqual([9887]);
    expect(requests[3].genreIds).toBeDefined();
    expect(requests[4].keywordIds).toBeUndefined();
    expect(requests[4].genreIds).toBeDefined();
    expect((timingRecord().meta as Record<string, number>).discover_pages).toBe(5);
  });

  it("continues paging when a nonempty Discover page contains only excluded IDs", async () => {
    mocks.discoverMovies.mockResolvedValueOnce([{ id: 900 }])
      .mockResolvedValueOnce([301, 302, 303].map((id) => ({ id })));
    const recs = await deal();
    expect(recs.map((r) => r.movieId)).toEqual([11, 13, 101, 102, 103, 301, 302, 303]);
    expect(mocks.discoverMovies.mock.calls.map(([opts]) => opts.page)).toEqual([1, 2]);
  });

  it("hands the model the titles it keeps re-proposing, even when they sit deep in capped history", async () => {
    // Production evidence (batch 214): the model re-proposed 11 films dealt in
    // July that rank 773–1,841 of 1,841 recommendation rows — none reachable by
    // the newest-first 120-title cap — and had re-proposed the same titles 3–38
    // times across its own logged completions. Those stable repeats must reach
    // the prompt; their IDs already exclude them, so this is prompt-only.
    const repeatIds = Array.from({ length: 60 }, (_, i) => 4000 + i);
    mocks.unpagedHistoryCap = 1000;
    mocks.history = {
      loved_movies: [{ movie_id: 900, movies: { title: "Loved seed", year: 2000 } }],
      watch_logs: Array.from({ length: 100 }, (_, i) => ({
        movie_id: 5000 + i, movies: { title: `Watched ${i}`, year: 2000 },
      })),
      recommendations: [
        ...Array.from({ length: 200 }, (_, i) => ({ movie_id: 3000 + i, movies: { title: `Rec ${i}`, year: 2000 } })),
        ...repeatIds.map((movie_id) => ({ movie_id, movies: { title: `Trap ${movie_id}`, year: 2000 } })),
      ],
    } as typeof mocks.history;
    mocks.aiLogs = [
      { raw: JSON.stringify({ recs: [{ title: "Trap 4000", year: 2000 }, { title: "Trap 4001", year: 2000 }] }) },
      { raw: JSON.stringify({ recs: [{ title: "Trap 4000", year: 2000 }, { title: "Trap 4001", year: 2000 }, { title: "Trap 4003", year: 2000 }] }) },
    ];
    let promptTitles: string[] = [];
    const generate = mocks.generateRecCandidates.getMockImplementation()!;
    mocks.generateRecCandidates.mockImplementation(async (...args) => {
      promptTitles = [...args[0].exclusionTitles];
      return generate(...args);
    });

    const recs = await deal();

    // The stable repeats are appended after the untouched newest-first head…
    expect(promptTitles).toHaveLength(122); // 120 capped head + 2 stable repeats
    expect(promptTitles[0]).toBe("Loved seed (2000)");
    expect(promptTitles).toContain("Trap 4000 (2000)");
    expect(promptTitles).toContain("Trap 4001 (2000)");
    // A one-off proposal is not a pattern — and nothing is listed twice.
    expect(promptTitles.some((t) => t.startsWith("Trap 4003"))).toBe(false);
    expect(new Set(promptTitles).size).toBe(promptTitles.length);
    // Prompt composition changed; the frozen deal did not.
    expect(recs.map((r) => r.movieId)).toEqual([11, 13, 101, 102, 103]);
  });

  it("keeps the original prompt and deal when the optional log read fails", async () => {
    mocks.logReadError = true;
    const recs = await deal();
    expect(mocks.generateRecCandidates.mock.calls[0][0].exclusionTitles).toContain("Loved seed (2000)");
    expect(recs.map((r) => r.movieId)).toEqual([11, 13, 101, 102, 103]);
    expect(mocks.logSignal).toBeInstanceOf(AbortSignal);
  });

  it("rejects low-rated non-exceptions across LLM, similar and Discover", async () => {
    const original = mocks.cacheMovie.getMockImplementation()!;
    mocks.cacheMovie.mockImplementation(async (id: number) => ({
      ...await original(id), ratings: { imdb: 6.4, tmdb: 8, rt: 95 },
    }));
    mocks.discoverMovies.mockResolvedValue([{ id: 301 }]);
    const recs = await deal();
    expect(recs).toEqual([]);
    expect(mocks.recWrites).toEqual([]);
    expect(mocks.discoverMovies).toHaveBeenCalled();
  });

  it("allows a reviewed low-rated cult exception through the rating gate", async () => {
    mocks.generateRecCandidates.mockResolvedValue({ raw: "mock", candidates: { recs: [
      { title: "17473", year: 2003, reason: "A reviewed midnight-movie exception" },
    ] } });
    const original = mocks.cacheMovie.getMockImplementation()!;
    mocks.cacheMovie.mockImplementation(async (id: number) => ({
      ...await original(id),
      ...(id === 17473 ? { title: "The Room", year: 2003 } : {}),
      ratings: { imdb: 3.6, tmdb: 4, rt: null },
    }));
    const recs = await deal();
    expect(recs.map((r) => r.movieId)).toEqual([17473]);
    expect(mocks.recWrites.flat().map((r) => r.movie_id)).toEqual([17473]);
  });

  it("rejects known sub-feature runtimes and fails open on unknown runtime", async () => {
    // Same fixture as the cult-exception test, but the film is a 45-minute short.
    mocks.generateRecCandidates.mockResolvedValue({ raw: "mock", candidates: { recs: [
      { title: "17473", year: 2003, reason: "A short, not a film night" },
    ] } });
    const original = mocks.cacheMovie.getMockImplementation()!;
    const fixture = async (id: number, runtime: number | null) => ({
      ...await original(id),
      ...(id === 17473 ? { title: "The Room", year: 2003 } : {}),
      ratings: { imdb: 3.6, tmdb: 4, rt: null },
      runtime,
    });
    mocks.cacheMovie.mockImplementation((id: number) => fixture(id, 45));
    expect(await deal()).toEqual([]);
    expect(mocks.recWrites).toEqual([]);
    expect(timingRecord().meta).toMatchObject({ llm_runtime_rejected: 1 });

    // Unknown runtime is missing data about a verified film, not evidence
    // against it: the identical film passes with runtime null.
    mocks.cacheMovie.mockImplementation((id: number) => fixture(id, null));
    const recs = await deal();
    expect(recs.map((r) => r.movieId)).toEqual([17473]);
  });

  it("rejects unrated movies across all sources without filling with unknown quality", async () => {
    const original = mocks.cacheMovie.getMockImplementation()!;
    mocks.cacheMovie.mockImplementation(async (id: number) => ({
      ...await original(id), ratings: { imdb: null, tmdb: null, rt: 99 },
    }));
    mocks.discoverMovies.mockResolvedValue([{ id: 301 }]);
    expect(await deal()).toEqual([]);
    expect(mocks.recWrites).toEqual([]);
    expect(timingRecord().meta).toMatchObject({ discover_rating_rejected: 1 });
  });

  it.each(["history", "obscurity", "mood"])("cult rating exceptions still obey %s", async (gate) => {
    mocks.generateRecCandidates.mockResolvedValue({ raw: "mock", candidates: { recs: [
      { title: "17473", year: 2003, reason: "Cult exception" },
    ] } });
    mocks.getSimilarMovies.mockResolvedValue([]);
    if (gate === "history") mocks.history.recommendations = [
      { movie_id: 17473, movies: { title: "The Room", year: 2003 } },
    ];
    const original = mocks.cacheMovie.getMockImplementation()!;
    mocks.cacheMovie.mockImplementation(async (id: number) => ({
      ...await original(id), year: 2003, ratings: { imdb: 3.6, tmdb: 4, rt: null },
      vote_count: gate === "obscurity" ? 30000 : 400,
    }));
    // "Scare" requires Horror/Thriller; the fixture's Drama cannot pass it.
    const recs = await dealRecs("mock-user", {
      obscurityMin: 3, obscurityMax: 5, myServicesOnly: false,
      vibe: gate === "mood" ? "scare" : null,
    });
    expect(recs).toEqual([]);
    expect(mocks.recWrites).toEqual([]);
  });

  it.each(["similar", "discover"])("applies the cult exception to %s candidates too", async (source) => {
    mocks.generateRecCandidates.mockResolvedValue({ raw: "mock", candidates: { recs: [] } });
    mocks.getSimilarMovies.mockResolvedValue(source === "similar" ? [{ id: 26914 }] : []);
    mocks.discoverMovies.mockResolvedValue(source === "discover" ? [{ id: 26914 }] : []);
    const original = mocks.cacheMovie.getMockImplementation()!;
    mocks.cacheMovie.mockImplementation(async (id: number) => ({
      ...await original(id), title: "Troll 2", year: 1990, ratings: { imdb: null, tmdb: null, rt: null },
    }));
    expect((await deal()).map((r) => r.movieId)).toEqual([26914]);
  });

  it("keeps the loved-similar stage in graph order — similarity is the taste signal", async () => {
    // Deliberately a case where gemRank would reorder: 103 is a 9.2 loved-by-
    // the-few film, 101 merely liked. Graph order still wins here, because the
    // similar index is ranked by similarity to what THIS member loved — the
    // personal signal. byGemScore applies to the orderless sources (LLM list,
    // Discover pages), pinned by the two tests below.
    const original = mocks.cacheMovie.getMockImplementation()!;
    mocks.cacheMovie.mockImplementation(async (id: number) => {
      const movie = await original(id);
      if (id === 103) return { ...movie, ratings: { imdb: 9.2, tmdb: 8.5, rt: null } };
      if (id === 101) return { ...movie, ratings: { imdb: 6.6, tmdb: 6.6, rt: null } };
      return movie;
    });
    const recs = await deal();
    expect(recs.slice(2).map((r) => r.movieId)).toEqual([101, 102, 103]);
  });

  it("ranks LLM candidates by acclaim-vs-reach, not arrival order", async () => {
    mocks.generateRecCandidates.mockResolvedValue({ raw: "mock", candidates: { recs:
      Array.from({ length: 10 }, (_, i) => ({ title: String(i + 1), year: 2000, reason: "Taste match" })) } });
    const original = mocks.cacheMovie.getMockImplementation()!;
    mocks.cacheMovie.mockImplementation(async (id: number) => ({
      ...await original(id),
      // All pass the 6.5 gate; only candidate 10 is loved by the few who found it.
      ratings: id === 10 ? { imdb: 8.2, tmdb: 8, rt: 90 } : { imdb: 6.6, tmdb: 6, rt: null },
    }));
    mocks.getSimilarMovies.mockResolvedValue([]);
    expect((await deal())[0].movieId).toBe(10);
  });

  it("ranks each Discover page by acclaim-vs-reach before the survivor cap bites", async () => {
    mocks.getSimilarMovies.mockResolvedValue([{ id: 101 }, { id: 102 }, { id: 103 }]);
    mocks.discoverMovies.mockResolvedValue([301, 302, 303, 304].map((id) => ({ id })));
    const original = mocks.cacheMovie.getMockImplementation()!;
    mocks.cacheMovie.mockImplementation(async (id: number) => ({
      ...await original(id),
      // The default fixture admits 2 LLM + 3 similar films. Discover fills
      // the remaining 3 slots to the target of 8, choosing 304 ahead of 303.
      ratings: id === 304 ? { imdb: 8, tmdb: 8, rt: null } : { imdb: 6.6, tmdb: 6, rt: null },
    }));
    const recs = await deal();
    expect(recs.map((r) => r.movieId)).toEqual([11, 13, 101, 102, 103, 304, 301, 302]);
    expect(mocks.recWrites.flat().map((r) => r.movie_id)).toEqual(recs.map((r) => r.movieId));
  });

  it("fills a drained scare pool from the member's own taste-blend — horror AND their genre", async () => {
    mocks.generateRecCandidates.mockResolvedValue({ raw: "mock", candidates: { recs: [
      { title: "Already loved", year: 2000, reason: "Repeat" },
    ] } });
    mocks.getSimilarMovies.mockResolvedValue([]);
    // Only the blend intersection returns anything — horror alone is drained.
    mocks.discoverMovies.mockImplementation(async (opts) =>
      Array.isArray(opts.genreIds) && opts.genreIds.length === 2 ? [{ id: 601 }] : []);
    const original = mocks.cacheMovie.getMockImplementation()!;
    mocks.cacheMovie.mockImplementation(async (id: number) => ({
      ...await original(id),
      // A horror-drama hybrid: carries the vibe's genre, so the mood gate
      // passes by construction — the blend cannot smuggle in a pure drama.
      genres: ["Horror", "Drama"],
    }));
    const recs = await dealRecs("mock-user", {
      obscurityMin: 3, obscurityMax: 5, myServicesOnly: false, vibe: "scare",
    });
    expect(recs.map((r) => r.movieId)).toEqual([601]);
    expect(recs[0].reason).toContain("Vault pull");
    const requests = mocks.discoverMovies.mock.calls.map(([opts]) => opts);
    const blend = requests.find((opts) => Array.isArray(opts.genreIds) && opts.genreIds.length === 2);
    // Loved seed's Drama (18) crossed with Scare's horror (27) — the member's
    // own taste widening the pool, not a generic loosen-up.
    expect(blend.genreIds).toEqual([27, 18]);
    expect(blend.keywordIds).toBeUndefined();
    expect(timingRecord().meta).toMatchObject({ discover_blend_wideners: 1 });
  });

  it("measures Discover work without changing its selection or exposing error details", async () => {
    mocks.discoverMovies.mockResolvedValueOnce([301, 302, 303, 304].map((id) => ({ id })));
    mocks.insertErrors[301] = "private detail with user data";
    const recs = await deal();
    expect(recs.map((r) => r.movieId)).toEqual([11, 13, 101, 102, 103, 302, 303, 304]);
    expect(timingRecord().meta).toMatchObject({
      discover_pages: 1, discover_lookups: 4, discover_added: 3,
      discover_insert_failed: 1, discover_insert_error_unknown: 1, discover_failed: 0,
    });
    for (const key of ["discover_keyword_ms", "discover_fetch_ms", "discover_enrichment_ms", "discover_insert_ms"]) {
      expect(typeof timingRecord().meta?.[key]).toBe("number");
    }
    expect(JSON.stringify(timingRecord())).not.toContain("private detail");
  });

  it("records a Discover fetch failure while keeping already-dealt films", async () => {
    mocks.discoverMovies.mockRejectedValue(new Error("private detail"));
    expect((await deal()).map((r) => r.movieId)).toEqual([11, 13, 101, 102, 103]);
    expect(timingRecord().meta).toMatchObject({ discover_pages: 1, discover_failed: 1, discover_lookups: 0 });
  });

  it("never waits on a diagnostics write that never comes back", async () => {
    mocks.hangDiagnostics = true;

    // Hang both the ai_logs row and the analytics event. Neither is read by the
    // deal, so neither may hold the response.
    const recs = await Promise.race([
      deal(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("deal waited on a diagnostics write")), 1000),
      ),
    ]);

    expect(recs.map((r) => r.movieId)).toEqual([11, 13, 101, 102, 103]);
    expect(mocks.logWrites).toBeGreaterThan(0); // attempted, just not awaited
    const stages = Object.keys(timingRecord().stagesMs);
    expect(stages).not.toContain("ai_log_write");
    expect(stages).not.toContain("tracking");
  });
});
