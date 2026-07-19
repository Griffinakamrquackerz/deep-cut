// Rec-engine orchestration: Stage A (profile) + Stage B (recs w/ TMDB validation).
// The taste profile is the product; everything here sharpens or expresses it.

import {
  generateRecCandidates,
  generateTasteProfile,
  type LogBrief,
  type MovieBrief,
} from "./ai";
import { effectiveObscurity } from "./obscurity";
import { getRecentSignals, signalLine } from "./signals";
import { cacheMovie, discoverMovies, resolveTitleYear, TMDB_GENRE_IDS } from "./tmdb";
import type { Service } from "./services";
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
const EXCLUSION_PROMPT_CAP = 120;

async function getLovedBriefs(userId: string): Promise<Array<MovieBrief & { id: number }>> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("loved_movies")
    .select("movie_id, movies(id, title, year, genres, overview)")
    .eq("user_id", userId);
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
  const [loved, logs, recs] = await Promise.all([
    db.from("loved_movies").select("movie_id, movies(title, year)").eq("user_id", userId),
    db.from("watch_logs").select("movie_id, movies(title, year)").eq("user_id", userId),
    db.from("recommendations").select("movie_id, movies(title, year)").eq("user_id", userId),
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
  return { ids, titles: titles.slice(-EXCLUSION_PROMPT_CAP) };
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
}

/**
 * Stage B: ask Claude for candidates, validate every one against TMDB
 * (drop hallucinations), score real obscurity, persist survivors.
 */
export async function dealRecs(userId: string, opts: DealOptions): Promise<DealtRec[]> {
  const db = supabaseAdmin();
  const [profile, lovedBriefs, exclusions, svcRows] = await Promise.all([
    getOrCreateProfile(userId),
    getLovedBriefs(userId),
    getExclusions(userId),
    db.from("user_services").select("service").eq("user_id", userId),
  ]);
  const sparks = await getRecentSignals(db, userId, 10);
  const services = (svcRows.data ?? []).map((r) => r.service as string);
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
  // With "my services only" on, unwatchable survivors still persist (they're
  // valid recs) but don't count toward the target — the supplemental round
  // keeps hunting until enough films are watchable tonight.
  let watchableCount = 0;
  const targetMet = () =>
    (opts.myServicesOnly && services.length > 0 ? watchableCount : survivors.length) >=
    TARGET_RECS;

  // Single LLM round — Discover below tops up any shortfall in seconds,
  // and a second LLM round risks Vercel's 60s function limit.
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

    // With a vibe set, never drop to genre-less attempts — an off-vibe film is
    // worse than a short batch.
    const attempts: Array<{ genreIds?: number[]; services?: Service[] }> = wantServices
      ? vibe
        ? [{ genreIds, services: svc }, { genreIds }]
        : [{ genreIds, services: svc }, { services: svc }, { genreIds }, {}]
      : vibe
        ? [{ genreIds }]
        : [{ genreIds }, {}];

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
          withoutGenreIds: attempt.genreIds ? withoutGenreIds : undefined,
          minRating: vibe ? 5.5 : undefined, // vibe pulls stay watchable
          // The vault is an archive: no film younger than 18 months. New
          // releases have low vote counts that mimic obscurity (the Minions
          // bug); fresh finds are the LLM's job, verified by effectiveObscurity.
          releasedBefore: new Date(Date.now() - 548 * 86_400_000).toISOString().slice(0, 10),
          services: attempt.services,
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
