// All TMDB access goes through this module — nothing else calls the TMDB API.
// Docs: https://developer.themoviedb.org/reference/intro/getting-started

import { mapTmdbProviders, type Service } from "./services";
import { getOmdbRatings } from "./omdb";
import { supabaseAdmin } from "./supabase/admin";

const TMDB_BASE = "https://api.themoviedb.org/3";
const PROVIDER_TTL_MS = 7 * 24 * 60 * 60 * 1000; // refresh watch providers weekly

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
  await db.from("movies").upsert({
    id: details.id,
    title: details.title,
    year: details.year,
    runtime: details.runtime,
    poster_path: details.poster_path,
    overview: details.overview,
    genres: details.genres,
    popularity: details.popularity,
    vote_count: details.vote_count,
    tmdb_rating: ratings.tmdb,
    imdb_id: details.imdb_id,
    imdb_rating: ratings.imdb,
    rt_rating: ratings.rt,
    providers,
    providers_refreshed_at: now,
    ratings_refreshed_at: now,
    cached_at: now,
  });

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
