// Rec-engine orchestration: Stage A (profile) + Stage B (recs w/ TMDB validation).
// The taste profile is the product; everything here sharpens or expresses it.

import { after } from "next/server";
import {
  createLlmTrace,
  generateRecCandidates,
  generateTasteProfile,
  type LogBrief,
  type MovieBrief,
} from "./ai";
import { effectiveObscurity } from "./obscurity";
import { byGemScore, passesRecommendationRating } from "./recommendation-quality";
import { repeatExclusionTitles } from "./repeat-exclusions";
import { createDealTiming } from "./deal-timing";
import { orderedLookahead } from "./ordered-lookahead";
import { getRecentSignals, signalLine } from "./signals";
import {
  cacheMovie,
  discoverMovies,
  getSimilarMovies,
  resolveKeywordIds,
  resolveTitleYear,
  TMDB_GENRE_IDS,
} from "./tmdb";
import type { Service } from "./services";
import { getUserRegion, normalizeRegion, serviceAvailableIn } from "./region";
import { vibeByKey } from "./vibes";
import { supabaseAdmin } from "./supabase/admin";
import { track } from "./analytics";
import type { TasteProfile } from "./schemas";

/** Top TMDB genre ids across the user's loved films — the Discover taste proxy. */
export function topGenreIds(loved: Array<{ genres: string[] }>, take = 4): number[] {
  const counts = new Map<number, number>();
  for (const m of loved) {
    for (const g of m.genres) {
      const id = TMDB_GENRE_IDS[g];
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, take)
    .map(([id]) => id);
}

const REGEN_EVERY_LOGS = 5;
const TARGET_RECS = 8;
// Golden-age gate: the vault leans modern/relevant, but a few true classics
// still earn a slot. Cap pre-1970 films at ~1 per batch (≈8-12% of a deal).
const CLASSIC_YEAR = 1970;
const CLASSIC_MAX = 1;
// Feature-length floor: a known runtime under this is a short, TV special, or
// music video — not a film night. No ceiling: 4-hour epics are our audience's
// kind of film. DiscoverOpts can't express this (tmdb.ts has no runtime field)
// and a query filter would shrink the thin pools, so it gates post-enrichment.
const MIN_FEATURE_RUNTIME = 60;
// Every deal carries a few "because you loved X" deep cuts from TMDB's
// recommendation graph — the app visibly learning from your taste.
const SIMILAR_TARGET = 3;
// Keep enrichment concurrency conservative: each lookup can fan out to TMDB,
// OMDb and the movie cache. Buffer ahead during generation, consume in graph
// order, and never gate or write recommendations speculatively.
const SIMILAR_CONCURRENCY = 4;
// Keep the existing eight-candidate speculative budget; do not buy latency
// with a larger prefetch window. Rolling workers remove batch barriers instead.
const SIMILAR_PREFETCH = 8;

/**
 * Do a write nobody is waiting for, once the response has gone out.
 *
 * Both callers are diagnostics: the raw model output kept for prompt tuning and
 * the analytics event. Neither is read by the deal, so neither belongs on its
 * critical path — the member is waiting on films, not on bookkeeping.
 *
 * `after()` only works inside a request; elsewhere it throws, hence the
 * fallback (the same shape as notifications.ts, for the same reason — the
 * caller must not have to care where it was called from). A failure is
 * swallowed: losing a log row must never surface as a broken deal.
 */
function background(task: () => Promise<unknown>): void {
  const run = () => {
    void task().catch(() => undefined);
  };
  try {
    after(run);
  } catch {
    run();
  }
}

/** A cached movie's genre NAMES → their TMDB ids (drops any unmapped). */
function movieGenreIds(genres: string[]): number[] {
  return genres.map((g) => TMDB_GENRE_IDS[g]).filter((n): n is number => !!n);
}

/** Optional prompt context; database failures leave the original head intact. */
async function getRepeatLogs(db: Db, userId: string) {
  try {
    const { data, error } = await db.from("ai_logs")
      .select("raw")
      .eq("user_id", userId)
      .eq("stage", "recs")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(300)
      .abortSignal(AbortSignal.timeout(1500));
    return error ? [] : (data ?? []) as Array<{ raw: unknown }>;
  } catch {
    return [];
  }
}

type SimilarCandidate = { id: number; from: string };
type SimilarResult = Awaited<ReturnType<typeof cacheMovie>>;
type SimilarSource = ReturnType<typeof orderedLookahead<SimilarCandidate, SimilarResult>> & {
  lookups: { started: number; skipped: number; consumed: number };
  fetchedIds: Set<number>;
};

/**
 * The loved-similar candidate list: TMDB's recommendation graph for the six most
 * recently loved films, deduped, in graph order.
 *
 * Reads the monotonically growing exclusion set immediately before enrichment.
 * An already-excluded ID can never survive the final gate, so avoid that I/O.
 * No selection state is mutated here; the final ordered gates still re-check IDs.
 */
async function buildSimilarSource(
  seeds: Array<{ id: number; title: string }>,
  batch: number,
  excludedIds: ReadonlySet<number>,
): Promise<SimilarSource> {
  const seen = new Set<number>();
  const graph: SimilarCandidate[] = [];
  const pulls = await Promise.all(
    // Rotate the page per batch so repeat deals surface different neighbours.
    seeds.map((s) => getSimilarMovies(s.id, ((batch - 1) % 3) + 1).catch(() => [])),
  );
  pulls.forEach((list, i) => {
    for (const r of list) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      graph.push({ id: r.id, from: seeds[i].title });
    }
  });
  const lookups = { started: 0, skipped: 0, consumed: 0 };
  const fetchedIds = new Set<number>();
  const source = orderedLookahead(graph, SIMILAR_CONCURRENCY, SIMILAR_PREFETCH, async ({ id }) => {
    if (excludedIds.has(id)) { lookups.skipped++; return null; }
    lookups.started++;
    fetchedIds.add(id);
    return cacheMovie(id).catch(() => null);
  });
  return { ...source, lookups, fetchedIds };
}

/** The pieces a gated survivor needs before it can be written down. */
interface AcceptedRec {
  movie: NonNullable<SimilarResult>;
  reason: string;
  obscurity: number;
}

type Db = ReturnType<typeof supabaseAdmin>;

/** One recommendation row, ready to insert. */
function recRow(
  userId: string,
  batch: number,
  entry: AcceptedRec,
): { user_id: string; movie_id: number; reason: string; obscurity: number; status: string; batch: number } {
  return {
    user_id: userId,
    movie_id: entry.movie.id,
    reason: entry.reason,
    obscurity: entry.obscurity,
    status: "active",
    batch,
  };
}

/**
 * Persist gated survivors, one round trip when possible.
 *
 * A dozen sequential inserts cost ~1.4s of a deal's tail for no reason. But the
 * plain multi-row insert is atomic, and production proved why that's a trap: a
 * single row already recommended in an earlier batch violates the
 * (user_id, movie_id) unique constraint, Postgres rejects the *whole*
 * statement, and the fallback quietly re-ran every film one-by-one — a fresh
 * 8-film deal paying a per-row tax because one title was a repeat.
 *
 * So the batch write is now an upsert with ignoreDuplicates (PostgREST's
 * "resolution=ignore-duplicates", i.e. ON CONFLICT (user_id, movie_id) DO
 * NOTHING): duplicates are skipped at the database in the same single round
 * trip, and only a genuine database error falls back to the one-row-at-a-time
 * path. Either way the caller learns which path ran, so the production log can
 * prove it.
 */
async function persistRecs(
  db: Db,
  userId: string,
  batch: number,
  entries: AcceptedRec[],
): Promise<{ rows: Array<{ entry: AcceptedRec; id: string }>; path: "batch" | "per_row_fallback" }> {
  if (entries.length === 0) return { rows: [], path: "batch" };

  let batched: Array<{ id: string; movie_id: number }> | null = null;
  try {
    const { data, error } = await db
      .from("recommendations")
      .upsert(entries.map((entry) => recRow(userId, batch, entry)), {
        onConflict: "user_id,movie_id",
        ignoreDuplicates: true,
      })
      .select("id, movie_id");
    if (!error && data) batched = data as unknown as Array<{ id: string; movie_id: number }>;
  } catch {
    batched = null;
  }

  if (batched) {
    // Pair by movie id rather than trusting row order to be preserved. Skipped
    // duplicates simply don't appear in the returned rows — they cost nothing.
    const idByMovie = new Map(batched.map((r) => [r.movie_id, r.id]));
    return {
      rows: entries
        .map((entry) => ({ entry, id: idByMovie.get(entry.movie.id) }))
        .filter((x): x is { entry: AcceptedRec; id: string } => Boolean(x.id)),
      path: "batch",
    };
  }

  const out: Array<{ entry: AcceptedRec; id: string }> = [];
  for (const entry of entries) {
    const { data, error } = await db
      .from("recommendations")
      .insert(recRow(userId, batch, entry))
      .select("id")
      .single();
    if (error || !data) continue;
    out.push({ entry, id: (data as { id: string }).id });
  }
  return { rows: out, path: "per_row_fallback" };
}

async function getLovedBriefs(userId: string): Promise<Array<MovieBrief & { id: number }>> {
  const db = supabaseAdmin();
  // Newest first, and that ORDER BY is not cosmetic. The caller takes six of
  // these as the seeds for the loved-similar pass, with a comment saying
  // "most-recently loved carry the freshest taste" — and without an order,
  // PostgREST's row order is unspecified, so it was picking six arbitrary
  // films and the comment was describing something that wasn't happening.
  const { data } = await db
    .from("loved_movies")
    .select("movie_id, movies(id, title, year, genres, overview)")
    .eq("user_id", userId)
    .order("added_at", { ascending: false });
  return (data ?? [])
    .map((r) => {
      const m = r.movies as unknown as {
        id: number;
        title: string;
        year: number | null;
        genres: string[];
        overview: string | null;
      } | null;
      if (!m) return null;
      return {
        id: m.id,
        title: m.title,
        year: m.year,
        genres: m.genres ?? [],
        overview: m.overview ?? "",
      };
    })
    .filter((x): x is MovieBrief & { id: number } => x !== null);
}

async function getRecentLogBriefs(userId: string, limit = 20): Promise<LogBrief[]> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("watch_logs")
    .select("reaction, why, note, movies(title, year)")
    .eq("user_id", userId)
    .order("watched_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => {
    const m = r.movies as unknown as { title: string; year: number | null } | null;
    return {
      title: m?.title ?? "unknown",
      year: m?.year ?? null,
      reaction: r.reaction,
      why: r.why,
      note: r.note,
    };
  });
}

/** Stage A: (re)generate the taste profile and bump its version. */
export async function regenerateProfile(userId: string): Promise<TasteProfile> {
  const db = supabaseAdmin();
  const [loved, logs, sparks] = await Promise.all([
    getLovedBriefs(userId),
    getRecentLogBriefs(userId),
    getRecentSignals(db, userId, 15),
  ]);
  if (loved.length === 0) throw new Error("no loved movies");

  const { profile, raw } = await generateTasteProfile(loved, logs, sparks.map(signalLine));

  background(async () => {
    await db.from("ai_logs").insert({ user_id: userId, stage: "profile", raw });
  });

  const { data: existing } = await db
    .from("taste_profiles")
    .select("version")
    .eq("user_id", userId)
    .maybeSingle();

  await db.from("taste_profiles").upsert({
    user_id: userId,
    threads: profile.threads,
    version: (existing?.version ?? 0) + 1,
    generated_at: new Date().toISOString(),
  });

  await track(userId, "profile_generated", { threads: profile.threads.length });
  return profile;
}

export async function getOrCreateProfile(userId: string): Promise<TasteProfile> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("taste_profiles")
    .select("threads")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.threads && Array.isArray(data.threads) && data.threads.length > 0) {
    return { threads: data.threads as TasteProfile["threads"] };
  }
  return regenerateProfile(userId);
}

/** Everything the user has loved, logged, or been dealt — never recommend again. */
const RECYCLE_AFTER_DAYS = 30;
async function getExclusions(
  userId: string,
): Promise<{
  ids: Set<number>;
  titles: string[];
  /** Dealt but never engaged: re-dealable after the cooldown (see below). */
  recyclable: Map<number, string>;
}> {
  const db = supabaseAdmin();
  // Page through every source: PostgREST's response cap is not the end of a
  // member's history. Stable tie-breaking matters when a batch shares a timestamp.
  // Keep source precedence and the existing 120-title prompt head unchanged.
  async function readHistory(
    table: "loved_movies" | "watch_logs" | "recommendations",
    timestamp: "added_at" | "watched_at" | "created_at",
    extraColumns = "",
  ) {
    type Row = { movie_id: number; movies: unknown };
    const rows: Row[] = [];
    const pageSize = 500;
    for (;;) {
      const { data, error, count } = await db.from(table)
        .select(`movie_id, movies(title, year), ${timestamp}${extraColumns}`, { count: "exact" })
        .eq("user_id", userId)
        .order(timestamp, { ascending: false })
        .order(table === "loved_movies" ? "movie_id" : "id", { ascending: false })
        .range(rows.length, rows.length + pageSize - 1);
      // Never silently recommend against incomplete history after a read failure.
      if (error || !data) throw new Error("Could not load recommendation exclusions");
      const page = data as unknown as Row[];
      if (page.length === 0) {
        if (count != null && rows.length < count) throw new Error("Incomplete recommendation exclusions");
        break;
      }
      rows.push(...page);
      // Count also handles a server configured with a cap smaller than our page.
      if (count != null ? rows.length >= count : page.length < pageSize) break;
    }
    return rows;
  }
  const [loved, logs, recs, repeats] = await Promise.all([
    readHistory("loved_movies", "added_at"),
    readHistory("watch_logs", "watched_at"),
    readHistory("recommendations", "created_at", ", id, status"),
    getRepeatLogs(db, userId),
  ]);
  const ids = new Set<number>();
  const titles: string[] = [];
  const recyclable = new Map<number, string>();
  const engaged = new Set<number>();
  for (const r of [...loved, ...logs]) engaged.add(r.movie_id);
  const recycleCutoff = Date.now() - RECYCLE_AFTER_DAYS * 86_400_000;
  for (const rows of [loved, logs, recs]) {
    for (const r of rows ?? []) {
      // Unengaged dealt films come back later: an `active` recommendation older
      // than the cooldown that the member never touched (no loved/watch entry)
      // stops excluding its film — "offer it again at a later time". Anything
      // they DID engage with (watchlisted, dismissed after viewing, logged,
      // loved) is a verdict and stays excluded forever. Rows without a status
      // (legacy or synthetic) keep the old always-exclude behaviour.
      const rec = r as unknown as { id?: string; status?: string; created_at?: string };
      if (
        !ids.has(r.movie_id) &&
        rec.status === "active" &&
        rec.created_at != null &&
        Date.parse(rec.created_at) < recycleCutoff &&
        !engaged.has(r.movie_id)
      ) {
        if (rec.id) recyclable.set(r.movie_id, rec.id);
      } else if (rec.status !== undefined && rec.status !== "active") {
        engaged.add(r.movie_id); // watchlisted/dismissed = a verdict, never recycled
      }
      if (ids.has(r.movie_id)) continue;
      ids.add(r.movie_id);
      const m = r.movies as unknown as { title: string; year: number | null } | null;
      if (m) titles.push(`${m.title} (${m.year ?? "?"})`);
    }
  }
  for (const movieId of recyclable.keys()) ids.delete(movieId);
  // Keep the existing source-prioritized head; append only verified history
  // titles repeatedly proposed in recent logs. The ID exclusion set is unchanged.
  return { ids, titles: repeatExclusionTitles(titles, repeats), recyclable };
}

export interface DealtRec {
  id: string;
  movieId: number;
  title: string;
  year: number | null;
  reason: string;
  obscurity: number;
}

export interface DealOptions {
  obscurityMin: number;
  obscurityMax: number;
  myServicesOnly: boolean;
  /** Optional vibe key (see vibes.ts) — constrains tonight's deal to a mood. */
  vibe?: string | null;
  /**
   * Which country's streaming catalogue to deal against.
   *
   * Passed in by the route rather than only read from the profile, because the
   * route has the request and therefore the edge's geo header. Without this a
   * member who has never opened Settings would keep getting American
   * availability — the exact bug this work exists to fix, surviving in the one
   * path that matters most.
   */
  region?: string;
}

/**
 * Stage B: ask Claude for candidates, validate every one against TMDB
 * (drop hallucinations), score real obscurity, persist survivors.
 */
export async function dealRecs(userId: string, opts: DealOptions): Promise<DealtRec[]> {
  const timing = createDealTiming();
  let outcome: "success" | "error" = "error";
  try {
    const recs = await dealRecsWithTiming(userId, opts, timing);
    outcome = "success";
    return recs;
  } finally {
    timing.finish(outcome);
  }
}

async function dealRecsWithTiming(
  userId: string,
  opts: DealOptions,
  timing: ReturnType<typeof createDealTiming>,
): Promise<DealtRec[]> {
  const db = supabaseAdmin();
  // Timings are accumulated even when a request throws. Never log DB messages,
  // details, IDs or titles: only validated SQLSTATE/PostgREST codes and counts.
  const diagnostics: Record<string, number> = {};
  async function measured<T>(key: string, task: () => PromiseLike<T>): Promise<T> {
    const start = performance.now();
    try { return await task(); }
    finally { diagnostics[key] = (diagnostics[key] ?? 0) + performance.now() - start; }
  }
  function insertFailure(source: "similar" | "discover", error: { code?: string } | null) {
    const code = error?.code;
    const safe = code && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(code) ? code : "unknown";
    const key = `${source}_insert_error_${safe}`;
    diagnostics[key] = (diagnostics[key] ?? 0) + 1;
  }
  // One wave. These seven are independent of one another, and three of them used
  // to be awaited one after the next — three round trips of pure waiting before
  // the model could even be asked anything. Only the *order* changes here; every
  // value that comes out is the same value this code read before.
  const [profile, lovedBriefs, exclusions, svcRows, stored, sparks, batchRow] = await Promise.all([
    // If profile generation fails (LLM down on a first-ever deal), degrade to
    // empty threads — the Discover fallback below still runs off loved-genres.
    getOrCreateProfile(userId).catch(() => ({ threads: [] as TasteProfile["threads"] })),
    getLovedBriefs(userId),
    getExclusions(userId),
    db.from("user_services").select("service").eq("user_id", userId),
    // Which country's catalogue to ask TMDB about. This whole function used to
    // ask about America's, for everybody. Their own saved answer wins; the
    // route's geo guess covers anyone who hasn't given one.
    getUserRegion(db, userId),
    getRecentSignals(db, userId, 10),
    db
      .from("recommendations")
      .select("batch")
      .eq("user_id", userId)
      .order("batch", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const region = stored.regionKnown
    ? stored.region
    : (normalizeRegion(opts.region) ?? stored.region);
  // Filtered to what actually operates where they are. A member who saved Hulu
  // in Chicago and now watches from London would otherwise have every deal
  // filtered against a service TMDB reports nothing for in GB.
  const services = (svcRows.data ?? [])
    .map((r) => r.service as Service)
    .filter((s) => serviceAvailableIn(s, region));
  const vibe = vibeByKey(opts.vibe);
  const batch = (batchRow?.data?.batch ?? 0) + 1;
  timing.mark("context");

  const excludedIds = new Set(exclusions.ids);
  const excludedTitles = [...exclusions.titles];
  const recyclable = exclusions.recyclable;
  // A recycled film's old `active` row must be deleted before the new insert —
  // the (user_id, movie_id) unique constraint would otherwise reject the re-deal.
  // Scoped to exactly the films being re-dealt this batch, so an outage here can
  // only fail that one insert (counted), never corrupt other history.
  async function clearRecycled(movieId: number): Promise<void> {
    if (!recyclable.has(movieId)) return;
    recyclable.delete(movieId);
    // Best effort, never fatal: if this delete fails the stale row still sits
    // behind the unique (user_id, movie_id) constraint and the insert that
    // follows is rejected and counted like any other insert failure. Letting a
    // delete outage reject here would sink the whole batch instead.
    try {
      await db.from("recommendations")
        .delete()
        .eq("user_id", userId)
        .eq("movie_id", movieId)
        .eq("status", "active");
      diagnostics.recycled = (diagnostics.recycled ?? 0) + 1;
    } catch {
      diagnostics.recycle_failed = (diagnostics.recycle_failed ?? 0) + 1;
    }
  }
  const survivors: DealtRec[] = [];
  // One verified-rating policy across every source, before quotas or writes.
  // Rejected IDs stay excluded for this deal so fallback stages cannot re-add them.
  function passesQuality(movie: NonNullable<SimilarResult>, source: "llm" | "similar" | "discover") {
    if (!passesRecommendationRating(movie)) {
      const key = `${source}_rating_rejected`;
      diagnostics[key] = (diagnostics[key] ?? 0) + 1;
      excludedIds.add(movie.id);
      return false;
    }
    // Fail OPEN on unknown runtime: missing data about a verified film is not
    // evidence against it — the vault is full of obscure titles TMDB never
    // gave a runtime. Reject only a KNOWN below-floor runtime.
    if (movie.runtime != null && movie.runtime < MIN_FEATURE_RUNTIME) {
      const key = `${source}_runtime_rejected`;
      diagnostics[key] = (diagnostics[key] ?? 0) + 1;
      excludedIds.add(movie.id);
      return false;
    }
    return true;
  }

  // Age quota + on-vibe gate, shared by every sourcing path (LLM, loved-similar,
  // Discover). `offVibe` is the fix for wrong films bleeding in: it rejects
  // tone-breakers (avoidGenreIds) and, for genre-defining vibes, anything that
  // isn't actually that genre (requireGenreIds). `tooOld` enforces the classic cap.
  let classicCount = 0;
  const tooOld = (year: number | null) =>
    year != null && year < CLASSIC_YEAR && classicCount >= CLASSIC_MAX;
  const offVibe = (genres: string[]): boolean => {
    if (!vibe) return false;
    const ids = movieGenreIds(genres);
    if (vibe.avoidGenreIds?.some((a) => ids.includes(a))) return true;
    if (vibe.requireGenreIds?.length && !vibe.requireGenreIds.some((r) => ids.includes(r)))
      return true;
    return false;
  };
  // With "my services only" on, unwatchable survivors still persist (they're
  // valid recs) but don't count toward the target — the supplemental round
  // keeps hunting until enough films are watchable tonight.
  let watchableCount = 0;
  const targetMet = () =>
    (opts.myServicesOnly && services.length > 0 ? watchableCount : survivors.length) >=
    TARGET_RECS;

  // ── Start the loved-similar fetching NOW ──────────────────────────
  // It needs nothing the model produces — only the loved films and the batch
  // number — so it runs *while the model generates* rather than queueing behind
  // it. This was 5.6s of serial time on a production deal; here it stops being
  // serial time at all. Nothing is gated, inserted, or excluded here: the block
  // below still applies every exclusion, band, vibe and classic-cap gate, in
  // the same order, once the LLM round has finished. Same films, less waiting.
  //
  // getLovedBriefs returns newest-first, so the freshest taste is at the HEAD.
  // This was slice(-6), which took the tail — and before the ORDER BY landed it
  // was six arbitrary rows either way.
  const similarSeeds = lovedBriefs.slice(0, 6);
  const similarReady = lovedBriefs.length > 0
    ? buildSimilarSource(similarSeeds, batch, excludedIds).catch(() => null)
    : Promise.resolve(null);

  // Single LLM round — Discover below tops up any shortfall in seconds,
  // and a second LLM round risks Vercel's 60s function limit.
  // The whole round is guarded: an LLM failure (rate limit, 5xx, unparseable
  // JSON) must NOT 500 the deal — it falls through to the no-LLM TMDB Discover
  // fallback below, which is the difference between a new user's first deal
  // landing vs. "the projector jammed."
  let llmStage = "llm";
  try {
  for (let round = 0; round < 1 && !targetMet(); round++) {
    // What this stage cost AND why. 10s could be one slow generation or three
    // rate-limited requests plus a JSON repair pass — opposite fixes, and stage
    // timings alone can't tell them apart. See LlmTrace.
    const trace = createLlmTrace();
    const { candidates, raw } = await generateRecCandidates({
      threads: profile.threads,
      lovedTitles: lovedBriefs.map((m) => `${m.title} (${m.year ?? "?"})`),
      exclusionTitles: excludedTitles,
      services,
      obscurityMin: opts.obscurityMin,
      obscurityMax: opts.obscurityMax,
      myServicesOnly: opts.myServicesOnly,
      vibe: vibe ? { label: vibe.label, hint: vibe.hint } : null,
      recentSparks: sparks.map(signalLine),
    }, trace);
    timing.mark("llm");
    timing.note("llm_model", trace.model ?? "none");
    timing.note("llm_requests", trace.requests);
    timing.note("llm_models_tried", trace.modelsTried);
    timing.note("llm_repaired", trace.repaired);
    timing.note("llm_waited_ms", Math.round(trace.waitedMs));
    // Prompt-tuning material, not something the member is waiting on — this was
    // 5.7s of a production deal's critical path for a row nothing reads.
    background(async () => {
      await db.from("ai_logs").insert({ user_id: userId, stage: "recs", raw });
    });
    llmStage = "tmdb_validate";

    // Resolve + cache every candidate in parallel — serverless functions have a
    // hard 60s budget, and sequential TMDB validation of 12 films blows it.
    const resolved = (
      await Promise.all(
        candidates.recs.map(async (cand) => {
          // Resolve against TMDB — LLMs occasionally invent films.
          const tmdbId = await resolveTitleYear(cand.title, cand.year).catch(() => null);
          if (!tmdbId || excludedIds.has(tmdbId)) return null;
          const movie = await cacheMovie(tmdbId).catch(() => null);
          return movie ? { cand, movie } : null;
        }),
      )
    ).filter((x): x is NonNullable<typeof x> => x !== null);
    timing.mark("tmdb_validate");
    llmStage = "persist";

    // Gate the model's candidates in order — the same gates in the same
    // sequence — then write the survivors in one statement. This used to insert
    // one row at a time, which is ~1.4s of a deal's tail for no benefit.
    //
    // The caps are counted here, as the gates run, rather than after each
    // insert: a multi-row insert is atomic, so in the ordinary case every row
    // lands and the running totals are identical to what they were when each
    // insert completed before the next gate read them. The only divergence is on
    // the fallback path inside persistRecs, where a failed row would once have
    // freed a classic slot for a later candidate.
    const accepted: AcceptedRec[] = [];
    const acceptedIds = new Set<number>();
    // Rank the model's list by acclaim-vs-reach before gating: its output order
    // is thought-order, not quality, and the slots are scarce.
    const ranked = byGemScore(resolved, ({ movie }) => movie);
    for (const { cand, movie } of ranked) {
      if (survivors.length + accepted.length >= 12) break;
      // in-batch duplicate guard (the model repeating itself counts too)
      if (excludedIds.has(movie.id) || acceptedIds.has(movie.id)) continue;
      if (!passesQuality(movie, "llm")) continue;

      const obscurity = effectiveObscurity(movie);
      if (obscurity < opts.obscurityMin || obscurity > opts.obscurityMax) {
        // Real popularity outside the requested window — skip but exclude from retry.
        excludedIds.add(movie.id);
        excludedTitles.push(`${movie.title} (${movie.year ?? "?"})`);
        continue;
      }
      // The LLM occasionally returns an off-vibe film or a musty classic that
      // resolves and sits in-band — the structured gate the prompt can't enforce.
      if (offVibe(movie.genres) || tooOld(movie.year)) {
        excludedIds.add(movie.id);
        excludedTitles.push(`${movie.title} (${movie.year ?? "?"})`);
        continue;
      }

      accepted.push({ movie, reason: cand.reason, obscurity });
      acceptedIds.add(movie.id);
      if (movie.year != null && movie.year < CLASSIC_YEAR) classicCount++;
    }

    // Recycled films must have their stale row deleted before the batch insert,
    // or the unique (user_id, movie_id) constraint rejects the re-deal.
    for (const { movie } of accepted) await clearRecycled(movie.id);

    // unique(user_id, movie_id) still guards dupes in SQL — now inside the same
    // single statement via ON CONFLICT DO NOTHING, so a repeat title no longer
    // forces the per-row fallback.
    const persisted = await persistRecs(db, userId, batch, accepted);
    for (const { entry, id } of persisted.rows) {
      excludedIds.add(entry.movie.id);
      excludedTitles.push(`${entry.movie.title} (${entry.movie.year ?? "?"})`);
      if (services.some((s) => entry.movie.providers[s as keyof typeof entry.movie.providers])) {
        watchableCount++;
      }
      survivors.push({
        id,
        movieId: entry.movie.id,
        title: entry.movie.title,
        year: entry.movie.year,
        reason: entry.reason,
        obscurity: entry.obscurity,
      });
    }
    timing.mark("persist");
    // Proves in the production log which write path ran — "per_row_fallback"
    // here would mean a real database problem, not a duplicate title.
    timing.note("persist_path", persisted.path);
  }
  } catch (err) {
    // LLM round failed — log and drop through to the TMDB Discover fallback,
    // which needs no LLM and fills the batch from loved-genres + obscurity band.
    console.error("dealRecs: LLM round failed, using Discover fallback", err);
    timing.mark(llmStage); // Attribute failures to the operation that was running.
    // Tracked, not just logged. This is the invisible failure: the member gets
    // eight films, nothing looks broken, and the personalised half of the
    // engine didn't run — so the only symptom is recommendations that feel
    // generic, which is unreportable. A counted event makes a bad model day
    // something we can see in the admin console instead of guessing at.
    await track(userId, "deal_degraded", {
      reason: String(err instanceof Error ? err.message : err).slice(0, 160),
    });
    timing.mark("degraded_tracking");
  }

  // ── Learn from what you loved: deep cuts in the same vein ──────────
  // TMDB's recommendation graph for each recently-loved film, filtered to the
  // user's obscurity band so only the ones they likely HAVEN'T heard of survive.
  // This is the content-based "more like what you love, but obscure" signal the
  // LLM + genre net alone can't reach — real co-watch data, not a guess. Runs
  // regardless of whether the LLM already met target, up to SIMILAR_TARGET, so
  // every deal visibly reflects the taste it's learning.
  // Whatever the model's round cost, the fetching above has been running
  // alongside it. Resolve it now. If it failed, rebuild the source lazily so the
  // deal behaves exactly as it did before this overlap existed.
  let similar = await similarReady;
  if (!similar && lovedBriefs.length > 0) {
    similar = await buildSimilarSource(similarSeeds, batch, excludedIds).catch(() => null);
  }
  if (similar) timing.note("similar_ready_before_selection", similar.stats.completed);

  const similarCounts = { excluded: 0, enrichment_failed: 0, out_of_band: 0, vibe: 0, classic: 0, insert_failed: 0, added: 0 };
  let similarInsertMs = 0;
  let similarStage = "loved_similar_graph";
  try {
    timing.mark("loved_similar_graph");
    similarStage = "loved_similar_lookup_and_persist";
    if (lovedBriefs.length > 0 && survivors.length < 12 && similar) {
      // Consume in graph order, never completion order. Only enrichment runs
      // ahead; exclusions, gates and recommendation writes remain sequential.
      // Graph order IS this stage's taste ordering — TMDB's similar index ranks
      // by similarity to what the member actually loved, so it outranks any
      // global acclaim metric. byGemScore ordering is applied to the sources
      // with no personal order (the LLM list, Discover pages), not this one;
      // buffering here would also over-fetch and change the pinned consumption
      // semantics (see tests: pre-speed equality, excluded-lookup skipping).
      let simAdded = 0;
      for await (const {
        item: { id, from },
        result: movie,
      } of similar.results) {
        if (similar.fetchedIds.has(id)) similar.lookups.consumed++;
        if (simAdded >= SIMILAR_TARGET || survivors.length >= 12) break;
        if (excludedIds.has(id)) { similarCounts.excluded++; continue; }
        if (!movie) { similarCounts.enrichment_failed++; continue; }
        if (excludedIds.has(movie.id)) { similarCounts.excluded++; continue; }
        if (!passesQuality(movie, "similar")) continue;
        const obscurity = effectiveObscurity(movie);
        // In-band only → guarantees these are genuine deep cuts, not the
        // blockbuster "you loved X so here's the other famous one" pull.
        if (obscurity < opts.obscurityMin || obscurity > opts.obscurityMax) {
          similarCounts.out_of_band++;
          excludedIds.add(movie.id);
          continue;
        }
        if (offVibe(movie.genres)) {
          similarCounts.vibe++;
          excludedIds.add(movie.id);
          continue;
        }
        if (tooOld(movie.year)) {
          similarCounts.classic++;
          excludedIds.add(movie.id);
          continue;
        }
        const reason = `Because you loved ${from} — a deeper cut in the same vein${
          movie.year ? `, ${movie.year}` : ""
        }.`;
        await clearRecycled(movie.id);
        const insertStarted = performance.now();
        const { data: inserted, error } = await db
          .from("recommendations")
          .insert({ user_id: userId, movie_id: movie.id, reason, obscurity, status: "active", batch })
          .select("id")
          .single();
        similarInsertMs += performance.now() - insertStarted;
        if (error || !inserted) {
          similarCounts.insert_failed++;
          insertFailure("similar", error);
          continue;
        }
        similarCounts.added++;
        excludedIds.add(movie.id);
        simAdded++;
        if (movie.year != null && movie.year < CLASSIC_YEAR) classicCount++;
        if (services.some((s) => movie.providers[s as keyof typeof movie.providers])) {
          watchableCount++;
        }
        survivors.push({
          id: inserted.id,
          movieId: movie.id,
          title: movie.title,
          year: movie.year,
          reason,
          obscurity,
        });
        // Stop without requesting another item or extending the lookahead.
        if (simAdded >= SIMILAR_TARGET || survivors.length >= 12) break;
      }
    }
  } catch (err) {
    console.error("dealRecs: loved-similar seeding failed", err);
  } finally {
    similar?.close();
    if (similar) {
      timing.note("similar_candidates_scheduled", similar.stats.started);
      timing.note("similar_lookups_started", similar.lookups.started);
      timing.note("similar_lookups_skipped_excluded", similar.lookups.skipped);
      timing.note("similar_candidates_consumed", similar.stats.consumed);
      timing.note("similar_unused_lookups", similar.lookups.started - similar.lookups.consumed);
      timing.note("similar_enrichment_wait_ms", Math.round(similar.stats.waitMs));
    }
    timing.note("similar_insert_ms", Math.round(similarInsertMs));
    for (const [key, value] of Object.entries(similarCounts)) {
      timing.note(`similar_${key}`, value);
    }
    timing.mark(similarStage);
  }

  // ── Bottomless fallback: TMDB Discover ─────────────────────────────
  // When the LLM's picks all collide with the user's history (heavy users) or
  // fail validation, pull real films straight from TMDB by taste-genres +
  // obscurity band + services, loosening constraints until the batch fills.
  Object.assign(diagnostics, {
    discover_keyword_ms: 0, discover_fetch_ms: 0, discover_enrichment_ms: 0,
    discover_insert_ms: 0, discover_pages: 0, discover_lookups: 0,
    discover_insert_failed: 0, discover_added: 0, discover_failed: 0,
    discover_blend_wideners: 0,
  });
  try {
  if (!targetMet()) {
    // A vibe overrides taste-genres for the vault pull — the mood is the point.
    // Use the channel-tightened genre set (e.g. Scare = horror only, not any
    // thriller) and exclude tone-breakers so an off-genre film never slips in.
    const genreIds = vibe ? (vibe.rollGenreIds ?? vibe.genreIds) : topGenreIds(lovedBriefs);
    const withoutGenreIds = vibe?.avoidGenreIds;
    const svc = services as Service[];
    const wantServices = opts.myServicesOnly && svc.length > 0;
    const threadTitle = profile.threads[0]?.title ?? "your taste";

    // Tone vibes (mind, weird, laugh) source by TMDB keyword, not just genre —
    // the only way to reach surreal mind-melters like Enter the Void that no
    // genre net catches. Resolved once (cached); empty on miss so we degrade.
    const keywordIds = vibe?.keywords?.length
      ? await measured("discover_keyword_ms", () => resolveKeywordIds(vibe.keywords!)) : [];
    const hasKw = keywordIds.length > 0;

    // With a vibe set, never drop to genre-less attempts — an off-vibe film is
    // worse than a short batch. For tone vibes, try keyword pulls FIRST (genre
    // ∩ keyword, then keyword-only for off-genre gems), then the genre net tops up.
    type Attempt = { genreIds?: number[]; keywordIds?: number[]; services?: Service[] };
    // A TONE vibe (mind, weird, edge…) is NOT its genre — a bare "any sci-fi"
    // pull for "Melt my brain" drags in ordinary genre films that miss the mood.
    // So when a tone vibe has a keyword net, we source by keyword ONLY and drop
    // the bare-genre attempts entirely. Genre-defining vibes (scare→Horror,
    // laugh→Comedy) keep the bare-genre top-up — that pull is still on-vibe.
    const dropBareGenre = !!vibe && !vibe.requireGenreIds?.length && hasKw;
    const genreAttempts: Attempt[] = dropBareGenre
      ? []
      : wantServices
        ? vibe
          ? [{ genreIds, services: svc }, { genreIds }]
          : [{ genreIds, services: svc }, { services: svc }, { genreIds }, {}]
        : vibe
          ? [{ genreIds }]
          : [{ genreIds }, {}];
    // Pool-widening last resorts (tone vibes). The OR-union of every vibe
    // keyword is ONE pool, and a heavy member drains it — batch 215's live
    // preview found 37 of 40 vault films already in exclusion history. Two
    // wider pulls run only after the union attempts: a rotated single-keyword
    // pull (a different keyword focus each batch, so its own pool rotates) and
    // the vibe's genre net without keywords. Genre-defining vibes already end
    // broad, so they skip both — an off-vibe film is still worse than a short
    // batch, and their genre attempts were never removed.
    const toneWideners: Attempt[] = !dropBareGenre ? [] : [
      ...(keywordIds.length > 0
        ? [{ keywordIds: [keywordIds[(batch - 1) % keywordIds.length]] }]
        : []),
      { genreIds },
    ];
    // Taste-blend wideners (genre-defining vibes). "Scare me" for a sci-fi and
    // slasher member shouldn't keep draining the same horror well — the hybrid
    // pools (horror AND sci-fi, horror AND mystery…) hold exactly those films:
    // the Killer Klowns tier, not another asylum slasher. The member's top
    // loved genres MINUS the vibe's own core genres become intersection pulls
    // against the vibe's primary genre. The requireGenreIds gate still holds on
    // every candidate, so a blend result is on-vibe by construction — a film
    // tagged mystery-only can never ride in on the blend. Tone vibes skip
    // these: their keyword wideners already change the pool, and a blend would
    // shrink rather than widen what their keywords reach.
    const blendGenreIds = vibe?.requireGenreIds?.length
      ? topGenreIds(lovedBriefs, 6)
          .filter((g) => !(vibe.rollGenreIds ?? vibe.genreIds).includes(g)
            && !vibe.avoidGenreIds?.includes(g))
          .slice(0, 3)
      : [];
    const blendWideners: Attempt[] = blendGenreIds.map((blend) => ({
      // The intersection IS the hybrid: TMDB ANDs these ids, so this returns
      // films carrying BOTH the vibe's primary genre and the member's taste.
      genreIds: [genreIds[0], blend],
    }));
    const attempts: Attempt[] =
      vibe && hasKw
        ? wantServices
          ? [
              { genreIds, keywordIds, services: svc },
              { keywordIds, services: svc },
              ...genreAttempts,
              // Last resort: the vibe, without the streaming filter.
              //
              // Every attempt above carries `services`, and for a tone vibe
              // genreAttempts is empty — so a narrow taste with "my services
              // only" checked and the obscurity dial at the top had no attempt
              // left that could widen, and the deal came back empty. The
              // fallback is supposed to loosen constraints until the batch
              // fills; this is the one it never loosened.
              //
              // Services are a preference, the vibe is the request. A film
              // worth rewiring your evening for beats no film at all, and the
              // availability line on the card already says where to find it.
              { genreIds, keywordIds },
              { keywordIds },
              ...toneWideners,
              ...blendWideners,
            ]
          : [
              { genreIds, keywordIds },
              { keywordIds },
              ...genreAttempts,
              ...toneWideners,
              ...blendWideners,
            ]
        : [...genreAttempts, ...blendWideners];

    // One shared request budget for the whole Discover stage, and a reserved
    // page per widener that the same-pool attempts cannot spend. Without the
    // reserve the wideners are unreachable in the case they exist for: the
    // live preview's attempt trail (batch 212-216) shows all six budgeted
    // fetches carrying every vibe keyword, so neither widener ever ran —
    // `discover_added` stayed 0 until stale rows became recyclable. The cost is
    // that same-pool attempts are trimmed to fit the reserve.
    const PAGE_BUDGET = 6;
    const widenerFrom = attempts.length - toneWideners.length - blendWideners.length;
    const corePageCap = PAGE_BUDGET - toneWideners.length - blendWideners.length;
    // Blend wideners are the very last resorts: report how many were armed so
    // the preview trail can attribute a blend fill to the member's own taste.
    if (blendWideners.length > 0) diagnostics.discover_blend_wideners = blendWideners.length;
    let pagesUsed = 0;
    for (let i = 0; i < attempts.length; i++) {
      const attempt = attempts[i];
      const isWidener = i >= widenerFrom;
      // A widener keeps its reserved page plus one for every widener after it,
      // so a failing earlier widener can never starve the pool-changing ones.
      const cap = isWidener ? corePageCap + (i - widenerFrom) + 1 : corePageCap;
      if (targetMet() || survivors.length >= 12 || pagesUsed >= PAGE_BUDGET) break;
      // A same-pool attempt that has spent the core share yields its remaining
      // pages to the wideners instead of crawling again with the same filters.
      if (!isWidener && pagesUsed >= corePageCap) continue;
      // Rotate pages per batch so repeat deals surface different films. A
      // widener opens on page 1 instead: rotation exists to vary repeat deals,
      // and a last resort is reached precisely when the rotated pages are
      // exhausted — the trail shows pages 10-11 returning nothing for a narrow
      // pool while page 1 returned 20 ids.
      for (let p = 0; p < 3 && !targetMet() && survivors.length < 12 && pagesUsed < cap; p++) {
        pagesUsed++;
        const page = isWidener ? p + 1 : (((batch - 1) * 3 + p) % 12) + 1;
        diagnostics.discover_pages++;
        let found = await measured("discover_fetch_ms", () => discoverMovies({
          obscurityMin: opts.obscurityMin,
          obscurityMax: opts.obscurityMax,
          genreIds: attempt.genreIds,
          keywordIds: attempt.keywordIds,
          withoutGenreIds: attempt.genreIds || attempt.keywordIds ? withoutGenreIds : undefined,
          // Deepest-cut-first, NOT most-popular and NOT best-rated. This call
          // inherited popularity.desc until it was set to vote_average.desc —
          // but "highest rated within the vote band" surfaced beloved classics
          // whose IMDb fame (25k+ votes) caps them below the obscurity band, so
          // every candidate was enriched and then rejected (live preview, batch
          // 215: 39 fetched, 0 dealt). Sorting by vote_count.asc walks the vault
          // from the deepest end; the rating floor (below) and the 6.5 IMDb gate
          // still hold the quality bar, and byGemScore ranks what survives.
          sortBy: "vote_count.asc",
          // Required with vote-count sorting: the floor that keeps the deep end
          // from being unrated junk.
          minVotes: 300,
          // A floor even with no vibe set. It used to apply only to vibe pulls,
          // so an "any vibe" deal had no quality bar at all — which is how a
          // film rated 5.2 with 46% on Rotten Tomatoes became a recommendation.
          minRating: vibe ? 5.5 : 6,
          // The vault is an archive: no film younger than 18 months. New
          // releases have low vote counts that mimic obscurity (the Minions
          // bug); fresh finds are the LLM's job, verified by effectiveObscurity.
          releasedBefore: new Date(Date.now() - 548 * 86_400_000).toISOString().slice(0, 10),
          services: attempt.services,
          region,
          page,
        }));
        // Page rotation can start past the available results of a narrow search
        // (batch 214+ starts at page 4). When the first page of an attempt is
        // empty and beyond page 1, retry from page 1 before abandoning this
        // filter configuration — a small result set shouldn't look empty just
        // because the rotation landed on page 4+. A widener already opened on
        // page 1, so this retry only ever applies to the rotated attempts.
        if (found.length === 0 && p === 0 && page > 1 && pagesUsed < cap) {
          pagesUsed++;
          // Counted, so the diagnostic reports the budget actually spent rather
          // than understating it by the retries. The live preview's artifact read
          // 4 against 6 requests issued, which is exactly the kind of drift that
          // makes an attribution trail untrustworthy.
          diagnostics.discover_pages++;
          found = await measured("discover_fetch_ms", () => discoverMovies({
            obscurityMin: opts.obscurityMin,
            obscurityMax: opts.obscurityMax,
            genreIds: attempt.genreIds,
            keywordIds: attempt.keywordIds,
            withoutGenreIds: attempt.genreIds || attempt.keywordIds ? withoutGenreIds : undefined,
            sortBy: "vote_count.asc",
            minVotes: 300,
            minRating: vibe ? 5.5 : 6,
            releasedBefore: new Date(Date.now() - 548 * 86_400_000).toISOString().slice(0, 10),
            services: attempt.services,
            region,
            page: 1,
          }));
        }
        // An empty response ends this filter attempt (TMDB errors also return
        // []). Preserve the shared request budget for the existing broader
        // fallbacks rather than requesting more pages with the same filters.
        if (found.length === 0) break;
        const fresh = found.filter((f) => !excludedIds.has(f.id)).slice(0, 12);
        if (fresh.length === 0) continue;

        diagnostics.discover_lookups += fresh.length;
        const cached = (
          await measured("discover_enrichment_ms", () =>
            Promise.all(fresh.map((f) => cacheMovie(f.id).catch(() => null))))
        ).filter((m): m is NonNullable<typeof m> => m !== null);

        // Rank the page by acclaim-vs-reach, not TMDB's vote_average order —
        // most-loved-least-seen means little without weighing how few saw it.
        for (const movie of byGemScore(cached, (m) => m)) {
          if (targetMet() || survivors.length >= 12) break;
          if (excludedIds.has(movie.id)) continue;
          if (!passesQuality(movie, "discover")) continue;
          const obscurity = effectiveObscurity(movie);
          if (obscurity < opts.obscurityMin || obscurity > opts.obscurityMax) {
            excludedIds.add(movie.id);
            continue;
          }
          // Keyword-only pulls skip the genre filter, so re-check the vibe gate
          // here; and hold the classic cap across the whole batch.
          if (offVibe(movie.genres) || tooOld(movie.year)) {
            excludedIds.add(movie.id);
            continue;
          }
          const reason = vibe
            ? `Vault pull for tonight's “${vibe.label}” vibe — ${
                movie.genres.slice(0, 2).join("/") || "wild card"
              }, ${movie.year ?? "year unknown"}.`
            : `Vault pull for your “${threadTitle}” thread — ${
                movie.genres.slice(0, 2).join("/") || "wild card"
              }, ${movie.year ?? "year unknown"}.`;
          await clearRecycled(movie.id);
          const { data: inserted, error } = await measured("discover_insert_ms", () => db
            .from("recommendations")
            .insert({
              user_id: userId,
              movie_id: movie.id,
              reason,
              obscurity,
              status: "active",
              batch,
            })
            .select("id")
            .single());
          if (error || !inserted) {
            diagnostics.discover_insert_failed++;
            insertFailure("discover", error);
            continue;
          }
          diagnostics.discover_added++;

          excludedIds.add(movie.id);
          if (movie.year != null && movie.year < CLASSIC_YEAR) classicCount++;
          if (svc.some((s) => movie.providers[s])) watchableCount++;
          survivors.push({
            id: inserted.id,
            movieId: movie.id,
            title: movie.title,
            year: movie.year,
            reason,
            obscurity,
          });
        }
      }
    }
  }
  } catch {
    diagnostics.discover_failed++;
    // Discover is best-effort — a fallback failure must never sink the deal.
  }
  for (const [key, value] of Object.entries(diagnostics)) timing.note(key, Math.round(value));
  timing.mark("discover");

  background(() =>
    track(userId, "rec_batch_dealt", {
      batch,
      count: survivors.length,
      vibe: opts.vibe ?? null,
    }),
  );
  return survivors;
}

/** Log a watch; regenerate the profile every 5th log. */
export async function logWatch(
  userId: string,
  input: {
    movieId: number;
    reaction: string;
    why?: string | null;
    note?: string | null;
    recId?: string | null;
  },
): Promise<{ regenerated: boolean }> {
  const db = supabaseAdmin();
  await cacheMovie(input.movieId).catch(() => null);

  const { error } = await db.from("watch_logs").insert({
    user_id: userId,
    movie_id: input.movieId,
    reaction: input.reaction,
    why: input.why ?? null,
    note: input.note ?? null,
  });
  if (error) throw new Error(error.message);

  if (input.recId) {
    await db
      .from("recommendations")
      .update({ status: "seen" })
      .eq("id", input.recId)
      .eq("user_id", userId);
    await track(userId, "rec_seen", { recId: input.recId, reaction: input.reaction });
  }

  const { count } = await db
    .from("watch_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  const shouldRegen = !!count && count % REGEN_EVERY_LOGS === 0;
  if (shouldRegen) {
    await regenerateProfile(userId).catch(() => null); // best-effort; next deal retries
  }
  return { regenerated: shouldRegen };
}
