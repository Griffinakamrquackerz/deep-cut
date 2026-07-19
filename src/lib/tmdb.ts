// All TMDB access goes through this module — nothing else calls the TMDB API.
// Docs: https://developer.themoviedb.org/reference/intro/getting-started

import { mapTmdbProviders, tmdbProviderIds, type Service } from "./services";
import { getOmdbRatings } from "./omdb";
import { supabaseAdmin } from "./supabase/admin";

const TMDB_BASE = "https://api.themoviedb.org/3";
const PROVIDER_TTL_MS = 7 * 24 * 60 * 60 * 1000; // refresh watch providers weekly

// Standard TMDB movie genre ids (stable).
export const TMDB_GENRE_IDS: Record<string, number> = {
  Action: 28,
  Adventure: 12,
  Animation: 16,
  Comedy: 35,
  Crime: 80,
  Documentary: 99,
  Drama: 18,
  Family: 10751,
  Fantasy: 14,
  History: 36,
  Horror: 27,
  Music: 10402,
  Mystery: 9648,
  Romance: 10749,
  "Science Fiction": 878,
  "TV Movie": 10770,
  Thriller: 53,
  War: 10752,
  Western: 37,
};

// Obscurity band → TMDB vote_count bounds (inverse of obscurityFromVoteCount).
// min = least-obscure allowed → upper vote bound; max = most-obscure → lower bound.
const VOTE_LTE_BY_MIN: Record<number, number | undefined> = {
  1: undefined,
  2: 20_000,
  3: 8_000,
  4: 2_500,
  5: 800,
};
const VOTE_GTE_BY_MAX: Record<number, number> = {
  1: 20_000,
  2: 8_000,
  3: 2_500,
  4: 800,
  5: 50, // floor to skip unrated junk
};

export function voteBandForObscurity(
  min: number,
  max: number,
): { gte: number; lte: number | undefined } {
  return { gte: VOTE_GTE_BY_MAX[max] ?? 50, lte: VOTE_LTE_BY_MIN[min] };
}

export interface MovieRatings {
  tmdb: number | null; // /10
  imdb: number | null; // /10
  rt: number | null; // 0-100 (Rotten Tomatoes %)
}

export interface TmdbMovie {
  id: number;
  title: string;
  year: number | null;
  runtime: number | null;
  poster_path: string | null;
  overview: string;
  genres: string[];
  popularity: number;
  vote_count: number;
  vote_average: number | null; // TMDB rating, /10
  imdb_id: string | null;
}

export interface CachedMovie extends TmdbMovie {
  providers: Partial<Record<Service, boolean>>;
  ratings: MovieRatings;
}

function authParams(): { url: (path: string, qs?: Record<string, string>) => string; headers: Record<string, string> } {
  const key = process.env.TMDB_API_KEY ?? "";
  // v4 read tokens are JWTs ("ey..."); v3 keys are 32-char hex and go in the query string.
  const isBearer = key.startsWith("ey");
  return {
    url: (path, qs = {}) => {
      const p = new URLSearchParams(qs);
      if (!isBearer) p.set("api_key", key);
      const q = p.toString();
      return `${TMDB_BASE}${path}${q ? `?${q}` : ""}`;
    },
    headers: isBearer ? { Authorization: `Bearer ${key}` } : {},
  };
}

async function tmdbFetch<T>(path: string, qs: Record<string, string> = {}): Promise<T | null> {
  const { url, headers } = authParams();
  const res = await fetch(url(path, qs), { headers, next: { revalidate: 0 } });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`TMDB ${res.status} on ${path}`);
  }
  return (await res.json()) as T;
}

interface TmdbSearchResult {
  results: Array<{
    id: number;
    title: string;
    original_title?: string;
    release_date?: string;
    poster_path: string | null;
    overview: string;
    popularity: number;
    vote_count: number;
  }>;
}

export async function searchMovies(query: string) {
  const data = await tmdbFetch<TmdbSearchResult>("/search/movie", {
    query,
    include_adult: "false",
    language: "en-US",
    page: "1",
  });
  return (data?.results ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    original_title: r.original_title,
    year: r.release_date ? Number(r.release_date.slice(0, 4)) : null,
    poster_path: r.poster_path,
    overview: r.overview,
    popularity: r.popularity,
    vote_count: r.vote_count,
  }));
}

interface TmdbDetails {
  id: number;
  title: string;
  release_date?: string;
  runtime: number | null;
  poster_path: string | null;
  overview: string;
  genres: Array<{ name: string }>;
  popularity: number;
  vote_count: number;
  vote_average: number;
  imdb_id?: string | null;
  external_ids?: { imdb_id?: string | null };
}

export async function getMovieDetails(tmdbId: number): Promise<TmdbMovie | null> {
  // append_to_response pulls external_ids (imdb_id) in the same request.
  const d = await tmdbFetch<TmdbDetails>(`/movie/${tmdbId}`, {
    language: "en-US",
    append_to_response: "external_ids",
  });
  if (!d) return null;
  return {
    id: d.id,
    title: d.title,
    year: d.release_date ? Number(d.release_date.slice(0, 4)) : null,
    runtime: d.runtime,
    poster_path: d.poster_path,
    overview: d.overview,
    genres: d.genres.map((g) => g.name),
    popularity: d.popularity,
    vote_count: d.vote_count,
    vote_average: typeof d.vote_average === "number" && d.vote_average > 0 ? d.vote_average : null,
    imdb_id: d.imdb_id ?? d.external_ids?.imdb_id ?? null,
  };
}

interface TmdbProvidersPayload {
  results?: {
    US?: {
      flatrate?: Array<{ provider_id: number }>;
      ads?: Array<{ provider_id: number }>;
      free?: Array<{ provider_id: number }>;
    };
  };
}

/** US streaming availability (flatrate + ad-supported + free), mapped to our enum. */
export interface TmdbVideo {
  key: string;
  site: string;
  type: string;
  official: boolean;
  name: string;
  published_at?: string;
}

/**
 * Pick the best YouTube trailer from a TMDB videos payload:
 * official trailers > any trailer > official teaser > teaser; newest wins ties.
 * Clips/featurettes/BTS are ignored — a wrong "trailer" is worse than none.
 */
export function pickBestVideo(videos: TmdbVideo[]): { key: string; name: string } | null {
  const rank = (v: TmdbVideo) =>
    (v.type === "Trailer" ? 0 : 2) + (v.official ? 0 : 1);
  const candidates = videos
    .filter((v) => v.site === "YouTube" && v.key && (v.type === "Trailer" || v.type === "Teaser"))
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (b.published_at ?? "").localeCompare(a.published_at ?? ""),
    );
  const best = candidates[0];
  return best ? { key: best.key, name: best.name } : null;
}

/** Top production stills (backdrop file_paths) for a film, best-voted first. */
export async function getMovieStills(tmdbId: number, limit = 6): Promise<string[]> {
  const data = await tmdbFetch<{
    backdrops?: Array<{ file_path: string; vote_count: number }>;
  }>(`/movie/${tmdbId}/images`, { include_image_language: "null,en" });
  return (data?.backdrops ?? [])
    .sort((a, b) => b.vote_count - a.vote_count)
    .slice(0, limit)
    .map((b) => b.file_path);
}

/** Best YouTube trailer for a film, or null when TMDB has none. */
export async function getMovieTrailer(
  tmdbId: number,
): Promise<{ key: string; name: string } | null> {
  const data = await tmdbFetch<{ results: TmdbVideo[] }>(`/movie/${tmdbId}/videos`, {
    language: "en-US",
  });
  return pickBestVideo(data?.results ?? []);
}

export async function getWatchProviders(tmdbId: number): Promise<Service[]> {
  const data = await tmdbFetch<TmdbProvidersPayload>(`/movie/${tmdbId}/watch/providers`);
  const us = data?.results?.US;
  if (!us) return [];
  const ids = [...(us.flatrate ?? []), ...(us.ads ?? []), ...(us.free ?? [])].map(
    (p) => p.provider_id,
  );
  return mapTmdbProviders(ids);
}

/**
 * Fetch + upsert a movie into the `movies` cache table.
 * Providers are refreshed when older than a week (they change).
 */
export async function cacheMovie(
  tmdbId: number,
  opts: { force?: boolean } = {},
): Promise<CachedMovie | null> {
  const db = supabaseAdmin();
  const { data: existing } = await db.from("movies").select("*").eq("id", tmdbId).maybeSingle();

  // Fresh means providers refreshed within the week AND ratings have been
  // fetched at least once (older rows predate ratings — refresh to backfill).
  // `force` bypasses the cache to re-enrich (e.g. after adding an OMDb key).
  const fresh =
    !opts.force &&
    existing?.providers_refreshed_at &&
    existing?.ratings_refreshed_at &&
    Date.now() - new Date(existing.providers_refreshed_at).getTime() < PROVIDER_TTL_MS;

  if (existing && fresh) {
    return {
      id: existing.id,
      title: existing.title,
      year: existing.year,
      runtime: existing.runtime,
      poster_path: existing.poster_path,
      overview: existing.overview ?? "",
      genres: existing.genres ?? [],
      popularity: Number(existing.popularity ?? 0),
      vote_count: existing.vote_count ?? 0,
      vote_average: existing.tmdb_rating != null ? Number(existing.tmdb_rating) : null,
      imdb_id: existing.imdb_id ?? null,
      providers: existing.providers ?? {},
      ratings: {
        tmdb: existing.tmdb_rating != null ? Number(existing.tmdb_rating) : null,
        imdb: existing.imdb_rating != null ? Number(existing.imdb_rating) : null,
        rt: existing.rt_rating != null ? Number(existing.rt_rating) : null,
      },
    };
  }

  const details = await getMovieDetails(tmdbId);
  if (!details) return null;
  const services = await getWatchProviders(tmdbId);
  const providers = Object.fromEntries(services.map((s) => [s, true])) as Partial<
    Record<Service, boolean>
  >;

  // IMDb + Rotten Tomatoes (no-op returning nulls when OMDB_API_KEY is unset).
  const omdb = details.imdb_id
    ? await getOmdbRatings(details.imdb_id).catch(() => ({ imdb: null, rt: null }))
    : { imdb: null, rt: null };

  const ratings: MovieRatings = {
    tmdb: details.vote_average,
    imdb: omdb.imdb,
    rt: omdb.rt,
  };

  const now = new Date().toISOString();
  const baseRow = {
    id: details.id,
    title: details.title,
    year: details.year,
    runtime: details.runtime,
    poster_path: details.poster_path,
    overview: details.overview,
    genres: details.genres,
    popularity: details.popularity,
    vote_count: details.vote_count,
    providers,
    providers_refreshed_at: now,
    cached_at: now,
  };

  let { error: upsertErr } = await db.from("movies").upsert({
    ...baseRow,
    tmdb_rating: ratings.tmdb,
    imdb_id: details.imdb_id,
    imdb_rating: ratings.imdb,
    rt_rating: ratings.rt,
    ratings_refreshed_at: now,
  });
  if (upsertErr) {
    // Ratings columns may not exist yet (migration 0003 unapplied) — retry the
    // pre-ratings shape so the cache write (and every FK depending on it) works.
    ({ error: upsertErr } = await db.from("movies").upsert(baseRow));
  }
  if (upsertErr) {
    // The movies row truly failed — recommendations/loved FKs would bounce.
    // Never pretend the cache write worked.
    return null;
  }

  return { ...details, providers, ratings };
}

export async function cacheMovies(tmdbIds: number[]): Promise<CachedMovie[]> {
  const out: CachedMovie[] = [];
  for (const id of tmdbIds) {
    const m = await cacheMovie(id).catch(() => null);
    if (m) out.push(m);
  }
  return out;
}

// ── Fuzzy title+year resolution ─────────────────────────────────────
// LLMs occasionally invent films or fudge years; anything that doesn't
// resolve to a real TMDB entry is dropped by the rec pipeline.

export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/^(the|a|an)\s+/i, "")
    .replace(/[^a-z0-9]/g, "");
}

export function titleYearMatch(
  candidate: { title: string; year: number },
  result: { title: string; original_title?: string; year: number | null },
): boolean {
  const wanted = normalizeTitle(candidate.title);
  const titles = [result.title, result.original_title].filter(Boolean) as string[];
  const titleOk = titles.some((t) => {
    const n = normalizeTitle(t);
    return n === wanted || n.startsWith(wanted) || wanted.startsWith(n);
  });
  if (!titleOk) return false;
  if (result.year == null) return false;
  return Math.abs(result.year - candidate.year) <= 1; // re-releases / regional dates
}

/** Resolve "title (year)" → tmdb_id, or null when TMDB has no plausible match. */
export async function resolveTitleYear(title: string, year: number): Promise<number | null> {
  const results = await searchMovies(title);
  const match = results.find((r) => titleYearMatch({ title, year }, r));
  return match?.id ?? null;
}

export function posterUrl(posterPath: string | null, size: "w342" | "w500" | "w780" = "w342") {
  return posterPath ? `https://image.tmdb.org/t/p/${size}${posterPath}` : null;
}

// ── Discover — the bottomless well ──────────────────────────────────
// Pulls real films straight from TMDB by obscurity band + genre + streaming
// provider. Used as the rec engine's fallback so the marquee never runs dry.

export interface DiscoverOpts {
  obscurityMin: number;
  obscurityMax: number;
  genreIds?: number[];
  services?: Service[]; // when set, only films streaming on these (US)
  page?: number;
  sortBy?: string;
}

export interface DiscoverResult {
  id: number;
  vote_count: number;
  vote_average: number;
  popularity: number;
}

export interface SettleCandidate {
  id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  overview: string;
  genre_ids: number[];
  vote_count: number;
  popularity: number;
}

/**
 * Richer discover for the Settle It pool — returns the fields the couch
 * needs (title, poster, overview, genres) with runtime filtered at query
 * time so results always respect a "keep it short" constraint.
 */
export async function discoverSettleCandidates(opts: {
  genreIds: number[];
  obscurityMin: number;
  obscurityMax: number;
  maxRuntime?: number;
  page?: number;
  /** Genres that break the channel's tone (comma = exclude ANY of these). */
  withoutGenreIds?: number[];
  /** YYYY-MM-DD ceiling — a real deep cut has had time to become one. */
  releasedBefore?: string;
  /** TMDB vote_average floor — obscure should not mean bad. */
  minRating?: number;
  /** "vote_average.desc" surfaces most-loved-least-seen (the hidden-gem sort). */
  sortBy?: "popularity.desc" | "vote_average.desc";
}): Promise<SettleCandidate[]> {
  const band = voteBandForObscurity(opts.obscurityMin, opts.obscurityMax);
  const qs: Record<string, string> = {
    include_adult: "false",
    include_video: "false",
    language: "en-US",
    sort_by: opts.sortBy ?? "popularity.desc",
    "vote_count.gte": String(Math.max(band.gte, 200)), // real films only
    page: String(opts.page ?? 1),
  };
  if (band.lte != null) qs["vote_count.lte"] = String(band.lte);
  if (opts.genreIds.length) qs.with_genres = opts.genreIds.join("|");
  if (opts.maxRuntime) qs["with_runtime.lte"] = String(opts.maxRuntime);
  if (opts.withoutGenreIds?.length) qs.without_genres = opts.withoutGenreIds.join(",");
  if (opts.releasedBefore) qs["primary_release_date.lte"] = opts.releasedBefore;
  if (opts.minRating) qs["vote_average.gte"] = String(opts.minRating);

  interface Payload {
    results?: Array<{
      id: number;
      title: string;
      release_date?: string;
      poster_path: string | null;
      overview: string;
      genre_ids?: number[];
      vote_count: number;
      popularity: number;
    }>;
  }
  const data = await tmdbFetch<Payload>("/discover/movie", qs).catch(() => null);
  return (data?.results ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    year: r.release_date ? Number(r.release_date.slice(0, 4)) : null,
    poster_path: r.poster_path,
    overview: r.overview ?? "",
    genre_ids: r.genre_ids ?? [],
    vote_count: r.vote_count,
    popularity: r.popularity,
  }));
}

export async function discoverMovies(opts: DiscoverOpts): Promise<DiscoverResult[]> {
  const band = voteBandForObscurity(opts.obscurityMin, opts.obscurityMax);
  const qs: Record<string, string> = {
    include_adult: "false",
    include_video: "false",
    language: "en-US",
    watch_region: "US",
    sort_by: opts.sortBy ?? "popularity.desc",
    "vote_count.gte": String(band.gte),
    page: String(opts.page ?? 1),
  };
  if (band.lte != null) qs["vote_count.lte"] = String(band.lte);
  if (opts.genreIds?.length) qs.with_genres = opts.genreIds.join("|"); // OR
  const providerIds = opts.services?.length ? tmdbProviderIds(opts.services) : [];
  if (providerIds.length) {
    qs.with_watch_providers = providerIds.join("|");
    qs.with_watch_monetization_types = "flatrate|ads|free";
  }

  interface DiscoverPayload {
    results?: Array<{
      id: number;
      vote_count: number;
      vote_average: number;
      popularity: number;
    }>;
  }
  const data = await tmdbFetch<DiscoverPayload>("/discover/movie", qs).catch(() => null);
  return (data?.results ?? []).map((r) => ({
    id: r.id,
    vote_count: r.vote_count,
    vote_average: r.vote_average,
    popularity: r.popularity,
  }));
}
