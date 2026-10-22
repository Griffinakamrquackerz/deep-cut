// Opt-in real-engine comparison. Normal tests never read credentials or use the network.
import { afterEach, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPreviewBoundary } from "./helpers/preview-boundary";
import type { CachedMovie } from "@/lib/tmdb";

const state = vi.hoisted(() => ({
  ranked: true,
  offline: false,
  movies: new Map<number, Promise<CachedMovie | null>>(),
  movieValues: new Map<number, CachedMovie>(),
  generation: null as Promise<unknown> | null,
  requestKey: "",
  trace: {} as Record<string, unknown>,
  errors: [] as string[],
  calls: [] as Array<{ source: string; ids: number[]; attempt?: Record<string, unknown> }>,
}));
vi.mock("next/server", () => ({ after: (task: () => void) => task() }));
vi.mock("@/lib/recommendation-quality", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/recommendation-quality")>();
  return { ...actual, byGemScore: (...args: Parameters<typeof actual.byGemScore>) =>
    state.ranked ? actual.byGemScore(...args) : [...args[0]] };
});
vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return { ...actual,
    generateTasteProfile: async () => { state.errors.push("Missing existing profile"); throw new Error("Preview cannot regenerate profiles"); },
    generateRecCandidates: async (...args: Parameters<typeof actual.generateRecCandidates>) => {
      const key = JSON.stringify(args[0]);
      if (state.generation && key !== state.requestKey) {
        state.errors.push("Generation context changed between arms"); throw new Error("Context mismatch");
      }
      if (!state.generation) {
        if (state.offline) throw new Error("Missing captured generation");
        state.requestKey = key;
        state.generation = actual.generateRecCandidates(...args).then((result) => {
          state.trace = { ...args[1] };
          return result;
        });
      }
      const result = await state.generation;
      if (args[1]) Object.assign(args[1], state.trace);
      return structuredClone(result);
    },
  };
});
vi.mock("@/lib/tmdb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tmdb")>();
  return { ...actual,
    cacheMovie: (id: number) => {
      if (!state.movies.has(id)) {
        if (state.offline) {
          state.errors.push("Uncaptured enrichment requested");
          return Promise.reject(new Error("Uncaptured movie"));
        }
        state.movies.set(id, actual.cacheMovie(id).then((movie) => {
          if (movie) state.movieValues.set(id, movie);
          else state.errors.push("Movie enrichment failed");
          return movie;
        }));
      }
      return state.movies.get(id)!;
    },
    discoverMovies: async (...args: Parameters<typeof actual.discoverMovies>) => {
      const rows = await actual.discoverMovies(...args);
      // Record WHICH filter configuration each fetch used. Without this the
      // artifact could only show that a slate grew, not whether the pool-widening
      // contributed to it — one member's preview is not evidence until the
      // attempt sequence is visible and falsifiable. Engine-level options only:
      // never the request URL, which carries the TMDB api_key.
      const o = args[0];
      state.calls.push({
        source: "discover",
        ids: rows.map((r) => r.id),
        attempt: {
          page: o.page ?? 1,
          keywordIds: o.keywordIds ?? null,
          genreIds: o.genreIds ?? null,
          withoutGenreIds: o.withoutGenreIds ?? null,
          services: o.services ?? null,
        },
      });
      return rows;
    },
    getSimilarMovies: async (...args: Parameters<typeof actual.getSimilarMovies>) => {
      const rows = await actual.getSimilarMovies(...args);
      // Parallel seed calls may complete in any order; normalize in the report.
      state.calls.push({ source: `similar:${args[0]}`, ids: rows.map((r) => r.id) });
      return rows;
    },
  };
});

import { dealRecs, type DealOptions } from "@/lib/engine";
import { resolveLlmConfig } from "@/lib/ai";
import { gemRank, passesRecommendationRating } from "@/lib/recommendation-quality";
import { readFileSync } from "node:fs";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.skipIf(process.env.DEEP_CUT_DEAL_PREVIEW !== "1")("compares real deals with frozen inputs and no database writes", async () => {
  const userId = process.env.DEEP_CUT_PREVIEW_USER_ID;
  const databaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const config = resolveLlmConfig();
  if (!userId || !databaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.TMDB_API_KEY || !config.apiKey) {
    throw new Error("Preview requires explicit member and API configuration");
  }
  if (config.provider !== "openai-compatible") throw new Error("Preview supports chat-completions only");
  // Sweeps pin the member via DEEP_CUT_PREVIEW_USER_ID and the mood via
  // DEEP_CUT_PREVIEW_VIBE (default "weird" — the heavy-member baseline).
  const options: DealOptions = { obscurityMin: 4, obscurityMax: 5, myServicesOnly: true,
    vibe: process.env.DEEP_CUT_PREVIEW_VIBE ?? "weird" };
  const boundary = createPreviewBoundary({ databaseUrl, userId, generationUrl: `${config.baseUrl}/chat/completions`, fetch: globalThis.fetch.bind(globalThis),
    // Sweeps across heavier members can legitimately need more than the default
    // 600 reads (thin pools mean wide fan-out); raise the ceiling explicitly,
    // never silently.
    maxReads: process.env.DEEP_CUT_PREVIEW_MAX_READS
      ? Number(process.env.DEEP_CUT_PREVIEW_MAX_READS)
      : undefined });
  // Replay mode: DEEP_CUT_PREVIEW_CAPTURE points at a capture from a previous run.
  // Every request must match a captured entry (hashed key, body included) or fail;
  // no network, no database writes, same inputs, comparable output across commits.
  const capturePath = process.env.DEEP_CUT_PREVIEW_CAPTURE;
  const replay = Boolean(capturePath);
  if (replay) boundary.loadCapture(JSON.parse(readFileSync(capturePath!, "utf8")));
  const captureFile = join(tmpdir(), `deep-cut-preview-capture-${Date.now()}.json`);
  vi.stubGlobal("fetch", boundary.fetch);
  const timing: unknown[] = [];
  vi.spyOn(console, "info").mockImplementation((_tag, record) => {
    if (typeof record === "string") { try { timing.push(JSON.parse(record)); } catch { /* Not timing JSON. */ } }
  });
  vi.spyOn(console, "error").mockImplementation(() => { state.errors.push("Engine reported a degraded stage"); });
  const artifact = join(tmpdir(), `deep-cut-deal-preview-${Date.now()}.json`);
  const report: Record<string, unknown> = {
    capturedAt: new Date().toISOString(), options, complete: false,
    scope: "One current member, reconstructed weird/4-5/services-on settings. Real engine, simulated successful persistence. Source-order baseline retains every current gate; NOT the historical engine. Shared captured inputs; offline verification. No editorial quality verdict or production latency claim.",
    limitations: ["Ranking compares enriched candidates within each LLM list/Discover page, not the full catalog.", "Similar stays in graph order.", "Provider flags use the production shared US cache; do not infer regional availability.", "High gem scores alone do not establish personal fit or critical distinction."],
  };
  async function run(ranked: boolean) {
    state.ranked = ranked;
    boundary.resetWrites();
    state.calls = [];
    const recs = await dealRecs(userId!, options);
    await Promise.allSettled([...state.movies.values()]);
    await boundary.drain();
    expect(boundary.rows().map((r) => r.movie_id)).toEqual(recs.map((r) => r.movieId));
    const selections = recs.map((rec) => {
      const movie = state.movieValues.get(rec.movieId);
      if (!movie) throw new Error("Missing selected movie evidence");
      expect(passesRecommendationRating(movie)).toBe(true);
      return { ...rec, ratings: movie.ratings, imdbVotes: movie.imdb_votes,
        tmdbVotes: movie.vote_count, gemScore: gemRank(movie), genres: movie.genres,
        overview: movie.overview, providers: movie.providers,
        source: rec.reason.startsWith("Vault pull") ? "discover" : rec.reason.startsWith("Because you loved") ? "similar" : "llm",
      };
    });
    return { selections, sourceCalls: structuredClone(state.calls).sort((a, b) => a.source.localeCompare(b.source)) };
  }
  try {
    // Capture the union needed by both paths, then verify both entirely offline.
    const sourceOrder = await run(false);
    report.sourceOrder = sourceOrder;
    const ranked = await run(true);
    report.ranked = ranked;
    boundary.setOffline();
    state.offline = true;
    expect(await run(false)).toEqual(sourceOrder);
    expect(await run(true)).toEqual(ranked);
    const before = new Set(sourceOrder.selections.map((r) => r.movieId));
    const after = new Set(ranked.selections.map((r) => r.movieId));
    report.added = ranked.selections.filter((r) => !before.has(r.movieId)).map((r) => r.title);
    report.removed = sourceOrder.selections.filter((r) => !after.has(r.movieId)).map((r) => r.title);
    report.trace = state.trace;
    report.timing = timing;
    expect(boundary.stats().blocked).toBe(0);
    expect(boundary.issues).toEqual([]);
    expect(state.errors).toEqual([]);
    report.complete = true;
  } finally {
    await Promise.allSettled([...state.movies.values()]);
    await boundary.drain();
    report.network = boundary.stats();
    report.issues = [...boundary.issues, ...state.errors];
    // No credentials, user IDs, raw requests, or database responses in artifacts.
    writeFileSync(artifact, JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log("DEAL_PREVIEW_ARTIFACT", artifact);
    // Persist the frozen input set so future runs (or other commits) can replay
    // this exact scenario offline. Contains hashed keys and response bodies only.
    if (!replay) {
      writeFileSync(captureFile, JSON.stringify(boundary.dump()), { mode: 0o600 });
      console.log("DEAL_PREVIEW_CAPTURE", captureFile);
    }
  }
}, 300_000);

