// Historical comparison fixture from f4cb56e329c519a6aa6e56f3d270d0f932692687.
// Only relative import paths are rewritten to use the shared mocked dependencies.
// Rec-engine orchestration: Stage A (profile) + Stage B (recs w/ TMDB validation).
// The taste profile is the product; everything here sharpens or expresses it.

import {
  generateRecCandidates,
  generateTasteProfile,
  type LogBrief,
  type MovieBrief,
} from "@/lib/ai";
import { effectiveObscurity } from "@/lib/obscurity";
import { getRecentSignals, signalLine } from "@/lib/signals";
import {
  cacheMovie,
  discoverMovies,
  getSimilarMovies,
  resolveKeywordIds,
  resolveTitleYear,
  TMDB_GENRE_IDS,
} from "@/lib/tmdb";
import type { Service } from "@/lib/services";
import { getUserRegion, normalizeRegion, serviceAvailableIn } from "@/lib/region";
import { vibeByKey } from "@/lib/vibes";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { track } from "@/lib/analytics";
import type { TasteProfile } from "@/lib/schemas";

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
const EXCLUSION_PROMPT_CAP = 120;
// Golden-age gate: the vault leans modern/relevant, but a few true classics
// still earn a slot. Cap pre-1970 films at ~1 per batch (≈8-12% of a deal).
const CLASSIC_YEAR = 1970;
const CLASSIC_MAX = 1;
// Every deal carries a few "because you loved X" deep cuts from TMDB's
// recommendation graph — the app visibly learning from your taste.
const SIMILAR_TARGET = 3;

/** A cached movie's genre NAMES → their TMDB ids (drops any unmapped). */
function movieGenreIds(genres: string[]): number[] {
  return genres.map((g) => TMDB_GENRE_IDS[g]).filter((n): n is number => !!n);
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

  await db.from("ai_logs").insert({ user_id: userId, stage: "profile", raw });

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
async function getExclusions(
  userId: string,
): Promise<{ ids: Set<number>; titles: string[] }> {
  const db = supabaseAdmin();
  // All three ordered newest-first. The `ids` set doesn't care about order —
  // it's exhaustive either way — but `titles` is capped and handed to the
  // model as "don't suggest these", and an unordered cap means the model is
  // told about an arbitrary 120 films rather than the 120 most recent. It
  // then re-proposes what it wasn't told about, those get dropped against the
  // full id set, and the yield per deal quietly collapses as history grows.
  const [loved, logs, recs] = await Promise.all([
    db
      .from("loved_movies")
      .select("movie_id, movies(title, year), added_at")
      .eq("user_id", userId)
      .order("added_at", { ascending: false }),
    db
      .from("watch_logs")
      .select("movie_id, movies(title, year), watched_at")
      .eq("user_id", userId)
      .order("watched_at", { ascending: false }),
    db
      .from("recommendations")
      .select("movie_id, movies(title, year), created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);
  const ids = new Set<number>();
  const titles: string[] = [];
  for (const rows of [loved.data, logs.data, recs.data]) {
    for (const r of rows ?? []) {
      if (ids.has(r.movie_id)) continue;
      ids.add(r.movie_id);
      const m = r.movies as unknown as { title: string; year: number | null } | null;
      if (m) titles.push(`${m.title} (${m.year ?? "?"})`);
    }
  }
  // slice(0, …) now, not slice(-…): the rows arrive newest-first, so the head
  // of this list is the recent history. Taking the tail would have handed the
  // model the oldest titles instead.
  return { ids, titles: titles.slice(0, EXCLUSION_PROMPT_CAP) };
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
  const db = supabaseAdmin();
  const [profile, lovedBriefs, exclusions, svcRows] = await Promise.all([
    // If profile generation fails (LLM down on a first-ever deal), degrade to
    // empty threads — the Discover fallback below still runs off loved-genres.
    getOrCreateProfile(userId).catch(() => ({ threads: [] as TasteProfile["threads"] })),
    getLovedBriefs(userId),
    getExclusions(userId),
    db.from("user_services").select("service").eq("user_id", userId),
  ]);
  // Which country's catalogue to ask TMDB about. This whole function used to
  // ask about America's, for everybody. Their own saved answer wins; the
  // route's geo guess covers anyone who hasn't given one.
  const stored = await getUserRegion(db, userId);
  const region = stored.regionKnown
    ? stored.region
    : (normalizeRegion(opts.region) ?? stored.region);
  const sparks = await getRecentSignals(db, userId, 10);
  // Filtered to what actually operates where they are. A member who saved Hulu
  // in Chicago and now watches from London would otherwise have every deal
  // filtered against a service TMDB reports nothing for in GB.
  const services = (svcRows.data ?? [])
    .map((r) => r.service as Service)
    .filter((s) => serviceAvailableIn(s, region));
  const vibe = vibeByKey(opts.vibe);

  const { data: batchRow } = await db
    .from("recommendations")
    .select("batch")
    .eq("user_id", userId)
    .order("batch", { ascending: false })
    .limit(1)
    .maybeSingle();
  const batch = (batchRow?.batch ?? 0) + 1;

  const excludedIds = new Set(exclusions.ids);
  const excludedTitles = [...exclusions.titles];
  const survivors: DealtRec[] = [];

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

  // Single LLM round — Discover below tops up any shortfall in seconds,
  // and a second LLM round risks Vercel's 60s function limit.
  // The whole round is guarded: an LLM failure (rate limit, 5xx, unparseable
  // JSON) must NOT 500 the deal — it falls through to the no-LLM TMDB Discover
  // fallback below, which is the difference between a new user's first deal
  // landing vs. "the projector jammed."
  try {
  for (let round = 0; round < 1 && !targetMet(); round++) {
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
    });
    await db.from("ai_logs").insert({ user_id: userId, stage: "recs", raw });

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

    for (const { cand, movie } of resolved) {
      if (survivors.length >= 12) break;
      if (excludedIds.has(movie.id)) continue; // in-batch duplicate guard

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

      const { data: inserted, error } = await db
        .from("recommendations")
        .insert({
          user_id: userId,
          movie_id: movie.id,
          reason: cand.reason,
          obscurity,
          status: "active",
          batch,
        })
        .select("id")
        .single();
      if (error || !inserted) continue; // unique(user_id, movie_id) guards dupes in SQL

      excludedIds.add(movie.id);
      excludedTitles.push(`${movie.title} (${movie.year ?? "?"})`);
      if (movie.year != null && movie.year < CLASSIC_YEAR) classicCount++;
      if (services.some((s) => movie.providers[s as keyof typeof movie.providers])) {
        watchableCount++;
      }
      survivors.push({
        id: inserted.id,
        movieId: movie.id,
        title: movie.title,
        year: movie.year,
        reason: cand.reason,
        obscurity,
      });
    }
  }
  } catch (err) {
    // LLM round failed — log and drop through to the TMDB Discover fallback,
    // which needs no LLM and fills the batch from loved-genres + obscurity band.
    console.error("dealRecs: LLM round failed, using Discover fallback", err);
    // Tracked, not just logged. This is the invisible failure: the member gets
    // eight films, nothing looks broken, and the personalised half of the
    // engine didn't run — so the only symptom is recommendations that feel
    // generic, which is unreportable. A counted event makes a bad model day
    // something we can see in the admin console instead of guessing at.
    await track(userId, "deal_degraded", {
      reason: String(err instanceof Error ? err.message : err).slice(0, 160),
    });
  }

  // ── Learn from what you loved: deep cuts in the same vein ──────────
  // TMDB's recommendation graph for each recently-loved film, filtered to the
  // user's obscurity band so only the ones they likely HAVEN'T heard of survive.
  // This is the content-based "more like what you love, but obscure" signal the
  // LLM + genre net alone can't reach — real co-watch data, not a guess. Runs
  // regardless of whether the LLM already met target, up to SIMILAR_TARGET, so
  // every deal visibly reflects the taste it's learning.
  try {
    if (lovedBriefs.length > 0 && survivors.length < 12) {
      // getLovedBriefs now returns newest-first, so the freshest taste is at
      // the HEAD. This was slice(-6), which took the tail — and before the
      // ORDER BY landed it was six arbitrary rows either way.
      const seeds = lovedBriefs.slice(0, 6);
      const seen = new Set<number>();
      const graph: Array<{ id: number; from: string }> = [];
      const pulls = await Promise.all(
        // Rotate the page per batch so repeat deals surface different neighbours.
        seeds.map((s) => getSimilarMovies(s.id, ((batch - 1) % 3) + 1).catch(() => [])),
      );
      pulls.forEach((list, i) => {
        for (const r of list) {
          if (excludedIds.has(r.id) || seen.has(r.id)) continue;
          seen.add(r.id);
          graph.push({ id: r.id, from: seeds[i].title });
        }
      });

      let simAdded = 0;
      for (const { id, from } of graph) {
        if (simAdded >= SIMILAR_TARGET || survivors.length >= 12) break;
        if (excludedIds.has(id)) continue;
        const movie = await cacheMovie(id).catch(() => null);
        if (!movie || excludedIds.has(movie.id)) continue;
        const obscurity = effectiveObscurity(movie);
        // In-band only → guarantees these are genuine deep cuts, not the
        // blockbuster "you loved X so here's the other famous one" pull.
        if (obscurity < opts.obscurityMin || obscurity > opts.obscurityMax) {
          excludedIds.add(movie.id);
          continue;
        }
        if (offVibe(movie.genres) || tooOld(movie.year)) {
          excludedIds.add(movie.id);
          continue;
        }
        const reason = `Because you loved ${from} — a deeper cut in the same vein${
          movie.year ? `, ${movie.year}` : ""
        }.`;
        const { data: inserted, error } = await db
          .from("recommendations")
          .insert({ user_id: userId, movie_id: movie.id, reason, obscurity, status: "active", batch })
          .select("id")
          .single();
        if (error || !inserted) continue;
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
      }
    }
  } catch (err) {
    console.error("dealRecs: loved-similar seeding failed", err);
  }

  // ── Bottomless fallback: TMDB Discover ─────────────────────────────
  // When the LLM's picks all collide with the user's history (heavy users) or
  // fail validation, pull real films straight from TMDB by taste-genres +
  // obscurity band + services, loosening constraints until the batch fills.
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
    const keywordIds = vibe?.keywords?.length ? await resolveKeywordIds(vibe.keywords) : [];
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
            ]
          : [{ genreIds, keywordIds }, { keywordIds }, ...genreAttempts]
        : genreAttempts;

    let pagesUsed = 0;
    for (const attempt of attempts) {
      if (targetMet() || survivors.length >= 12 || pagesUsed >= 6) break;
      // Rotate pages per batch so repeat deals surface different films.
      for (let p = 0; p < 3 && !targetMet() && survivors.length < 12 && pagesUsed < 6; p++) {
        pagesUsed++;
        const page = (((batch - 1) * 3 + p) % 12) + 1;
        const found = await discoverMovies({
          obscurityMin: opts.obscurityMin,
          obscurityMax: opts.obscurityMax,
          genreIds: attempt.genreIds,
          keywordIds: attempt.keywordIds,
          withoutGenreIds: attempt.genreIds || attempt.keywordIds ? withoutGenreIds : undefined,
          // Most-loved-least-seen, NOT most-popular. This call used to pass no
          // sort at all, so it inherited discoverMovies' popularity.desc
          // default and asked TMDB for the most popular films inside the vote
          // band — a machine for surfacing blockbusters whose TMDB vote counts
          // happen to look modest. Despicable Me 4 and xXx: Return of Xander
          // Cage arrived as "vault pulls" that way. The Roll channel has always
          // sorted this way; the deal never did.
          sortBy: "vote_average.desc",
          // Required with that sort, or the top of the list is fan-bombed films
          // with 60 votes and a 9.
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
        });
        const fresh = found.filter((f) => !excludedIds.has(f.id)).slice(0, 12);
        if (fresh.length === 0) continue;

        const cached = (
          await Promise.all(fresh.map((f) => cacheMovie(f.id).catch(() => null)))
        ).filter((m): m is NonNullable<typeof m> => m !== null);

        for (const movie of cached) {
          if (targetMet() || survivors.length >= 12) break;
          if (excludedIds.has(movie.id)) continue;
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
          const { data: inserted, error } = await db
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
            .single();
          if (error || !inserted) continue;

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
    // Discover is best-effort — a fallback failure must never sink the deal.
  }

  await track(userId, "rec_batch_dealt", {
    batch,
    count: survivors.length,
    vibe: opts.vibe ?? null,
  });
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
