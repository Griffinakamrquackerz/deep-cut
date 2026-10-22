// All TMDB access goes through this module — nothing else calls the TMDB API.
// Docs: https://developer.themoviedb.org/reference/intro/getting-started

import { mapTmdbProviders, tmdbProviderIds, type Service } from "./services";
import { getOmdbRatings } from "./omdb";
import { supabaseAdmin } from "./supabase/admin";
import { DEFAULT_REGION } from "./region";

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
  /** IMDb vote count (OMDb) — the fame signal effectiveObscurity caps on. */
  imdb_votes: number | null;
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

/**
 * How long each kind of TMDB response stays fresh in Next's data cache.
 *
 * Every call used to run with `revalidate: 0`, i.e. caching off — so a film's
 * cast, keywords and details were re-fetched over the network on every single
 * request. None of that data changes hour to hour, and the repeat cost showed
 * up as page latency everywhere. Vercel's data cache persists across
 * invocations, so this also spares a cold lambda the roundtrip.
 */
export const TMDB_TTL = {
  /** Details, credits, keywords, person, images — effectively immutable. */
  static: 86_400, // 24h
  /** Search + keyword resolution — queries repeat constantly across users. */
  search: 3_600, // 1h
  /** Trailers: new ones do get added, but rarely. */
  video: 43_200, // 12h
  /** Streaming availability genuinely churns. */
  providers: 21_600, // 6h
  /** Discover reels. Page rotation varies the cache key, so variety survives. */
  discover: 1_800, // 30m
} as const;

async function tmdbFetch<T>(
  path: string,
  qs: Record<string, string> = {},
  revalidate: number = TMDB_TTL.static,
): Promise<T | null> {
  const { url, headers } = authParams();
  const res = await fetch(url(path, qs), { headers, next: { revalidate } });
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
  const data = await tmdbFetch<TmdbSearchResult>(
    "/search/movie",
    { query, include_adult: "false", language: "en-US", page: "1" },
    TMDB_TTL.search,
  );
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
  // Keyed by ISO 3166-1 alpha-2. Used to be typed as `{ US?: ... }`, which is
  // how the engine came to answer every member's "what can I watch" question
  // with the American catalogue.
  results?: Record<
    string,
    | {
        flatrate?: Array<{ provider_id: number }>;
        ads?: Array<{ provider_id: number }>;
        free?: Array<{ provider_id: number }>;
      }
    | undefined
  >;
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
export async function getMovieStills(tmdbId: number, limit = 14): Promise<string[]> {
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
  const data = await tmdbFetch<{ results: TmdbVideo[] }>(
    `/movie/${tmdbId}/videos`,
    { language: "en-US" },
    TMDB_TTL.video,
  );
  return pickBestVideo(data?.results ?? []);
}

export interface CastMember {
  id: number;
  name: string;
  character: string | null;
  profilePath: string | null;
}
export interface CrewMember {
  id: number;
  name: string;
  job: string;
}
export interface MovieCredits {
  cast: CastMember[];
  crew: CrewMember[];
}

/** Top-billed cast + the key crew (director, writers, DP, composer). */
export async function getMovieCredits(tmdbId: number): Promise<MovieCredits> {
  const data = await tmdbFetch<{
    cast?: Array<{ id: number; name: string; character?: string; profile_path?: string | null }>;
    crew?: Array<{ id: number; name: string; job?: string }>;
  }>(`/movie/${tmdbId}/credits`, { language: "en-US" });

  const cast = (data?.cast ?? []).slice(0, 12).map((c) => ({
    id: c.id,
    name: c.name,
    character: c.character || null,
    profilePath: c.profile_path ?? null,
  }));

  // Only the crew people actually want on a film page, in this order.
  const KEY_JOBS = ["Director", "Screenplay", "Writer", "Story", "Composer", "Director of Photography"];
  const seen = new Set<string>();
  const crew = (data?.crew ?? [])
    .filter((c): c is { id: number; name: string; job: string } => !!c.job && KEY_JOBS.includes(c.job))
    .sort((a, b) => KEY_JOBS.indexOf(a.job) - KEY_JOBS.indexOf(b.job))
    .filter((c) => {
      const k = `${c.name}·${c.job}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 8)
    .map((c) => ({ id: c.id, name: c.name, job: c.job }));

  return { cast, crew };
}

export interface PersonFilm {
  id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  role: string | null; // character (cast) or job (crew)
  tmdb: number | null;
}
export interface PersonDetails {
  id: number;
  name: string;
  biography: string;
  profilePath: string | null;
  knownFor: string | null;
  birthday: string | null;
  placeOfBirth: string | null;
  films: PersonFilm[];
}

/** An actor/director page: details + their films, best-known first. */
export async function getPerson(id: number): Promise<PersonDetails | null> {
  const d = await tmdbFetch<{
    id: number;
    name: string;
    biography?: string;
    profile_path?: string | null;
    known_for_department?: string | null;
    birthday?: string | null;
    place_of_birth?: string | null;
    movie_credits?: {
      cast?: Array<{ id: number; title?: string; character?: string; release_date?: string; poster_path?: string | null; vote_average?: number; popularity?: number }>;
      crew?: Array<{ id: number; title?: string; job?: string; release_date?: string; poster_path?: string | null; vote_average?: number; popularity?: number }>;
    };
  }>(`/person/${id}`, { language: "en-US", append_to_response: "movie_credits" });
  if (!d?.id) return null;

  const byId = new Map<number, PersonFilm & { pop: number }>();
  const add = (
    c: { id: number; title?: string; release_date?: string; poster_path?: string | null; vote_average?: number; popularity?: number },
    role: string | null,
  ) => {
    if (!c.title || byId.has(c.id)) return; // first (cast before crew) wins
    byId.set(c.id, {
      id: c.id,
      title: c.title,
      year: c.release_date ? Number(c.release_date.slice(0, 4)) || null : null,
      poster_path: c.poster_path ?? null,
      role: role || null,
      tmdb: typeof c.vote_average === "number" && c.vote_average > 0 ? c.vote_average : null,
      pop: c.popularity ?? 0,
    });
  };
  for (const c of d.movie_credits?.cast ?? []) add(c, c.character ?? null);
  for (const c of d.movie_credits?.crew ?? []) add(c, c.job ?? null);

  const films = [...byId.values()]
    .sort((a, b) => b.pop - a.pop)
    .slice(0, 30)
    .map(({ pop: _pop, ...f }) => f);

  return {
    id: d.id,
    name: d.name,
    biography: d.biography ?? "",
    profilePath: d.profile_path ?? null,
    knownFor: d.known_for_department ?? null,
    birthday: d.birthday ?? null,
    placeOfBirth: d.place_of_birth ?? null,
    films,
  };
}

/**
 * Streaming availability in ONE region, mapped to our service enum.
 *
 * `region` is required rather than defaulted on purpose. A default would let a
 * new call site silently reproduce the bug this parameter exists to fix — the
 * compiler naming every caller is the point.
 *
 * No fallback to US when the region is absent from the payload: an empty array
 * means "we don't know of anywhere you can stream this", which is the truth.
 * Falling back would report American availability to somebody who can't use it.
 */
export async function getWatchProviders(
  tmdbId: number,
  region: string,
): Promise<Service[]> {
  const data = await tmdbFetch<TmdbProvidersPayload>(
    `/movie/${tmdbId}/watch/providers`,
    {},
    TMDB_TTL.providers,
  );
  const here = data?.results?.[region.toUpperCase()];
  if (!here) return [];
  const ids = [...(here.flatrate ?? []), ...(here.ads ?? []), ...(here.free ?? [])].map(
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
  //
  // Rows written before imdb_votes existed count as stale too: obscurity and
  // the gem score both lean on that number, and without this the fix couldn't
  // reach the already-cached library until each row's weekly TTL expired.
  // Only films that actually have an IMDb id qualify, so a film OMDb has no
  // entry for doesn't re-fetch forever.
  const needsImdbVotes =
    existing != null && existing.imdb_id != null && existing.imdb_votes == null;
  const fresh =
    !opts.force &&
    !needsImdbVotes &&
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
      imdb_votes: existing.imdb_votes != null ? Number(existing.imdb_votes) : null,
      providers: existing.providers ?? {},
      ratings: {
        tmdb: existing.tmdb_rating != null ? Number(existing.tmdb_rating) : null,
        imdb: existing.imdb_rating != null ? Number(existing.imdb_rating) : null,
        rt: existing.rt_rating != null ? Number(existing.rt_rating) : null,
      },
    };
  }

  // Details and providers don't depend on each other — fetch them together
  // rather than paying two sequential roundtrips. (OMDb below genuinely does
  // depend on details, for the imdb_id.)
  const [details, services] = await Promise.all([
    getMovieDetails(tmdbId),
    // DEFAULT_REGION, deliberately. `movies` is a shared cache keyed on tmdbId
    // alone, so whatever is stored here is one answer for everybody — writing a
    // single member's region into it would report their catalogue to every
    // other member. This column is therefore a US baseline, and anything shown
    // to a specific person calls getWatchProviders with their own region
    // instead. A region-keyed provider cache is the proper fix and is a
    // separate piece of work.
    getWatchProviders(tmdbId, DEFAULT_REGION).catch(() => [] as Service[]),
  ]);
  if (!details) return null;
  const providers = Object.fromEntries(services.map((s) => [s, true])) as Partial<
    Record<Service, boolean>
  >;

  // IMDb + Rotten Tomatoes (no-op returning nulls when OMDB_API_KEY is unset).
  const omdb = details.imdb_id
    ? await getOmdbRatings(details.imdb_id).catch(() => ({ imdb: null, rt: null, votes: null }))
    : { imdb: null, rt: null, votes: null };

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
    imdb_votes: omdb.votes,
    rt_rating: ratings.rt,
    ratings_refreshed_at: now,
  });
  if (upsertErr) {
    // imdb_votes may not exist yet (migration 0007 unapplied) — retry without
    // it before giving up on the ratings columns entirely.
    ({ error: upsertErr } = await db.from("movies").upsert({
      ...baseRow,
      tmdb_rating: ratings.tmdb,
      imdb_id: details.imdb_id,
      imdb_rating: ratings.imdb,
      rt_rating: ratings.rt,
      ratings_refreshed_at: now,
    }));
  }
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

  return { ...details, providers, ratings, imdb_votes: omdb.votes };
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
  keywordIds?: number[]; // OR-joined with_keywords — sources tone, not genre
  withoutGenreIds?: number[]; // exclude ANY of these (comma) — tone-breakers
  minRating?: number; // vote_average floor
  /** Raises the obscurity band's vote_count floor. Required with a
   *  vote_average.desc sort, which otherwise crowns fan-bombed 60-vote films. */
  minVotes?: number;
  releasedBefore?: string; // YYYY-MM-DD ceiling — the vault is an archive
  services?: Service[]; // when set, only films streaming on these
  page?: number;
  sortBy?: string;
  /** ISO 3166-1 alpha-2. Which country's catalogue to ask about. Required so
   *  the compiler names any call site that forgets — see getWatchProviders. */
  region: string;
}

// Resolve TMDB keyword NAMES → ids via /search/keyword, cached across the warm
// lambda. Tone vibes (mind, weird, laugh) name keywords; we look up their ids
// once so Discover can pull by tone. A miss just drops that keyword.
const keywordIdCache = new Map<string, number | null>();

export async function resolveKeywordIds(names: string[]): Promise<number[]> {
  const out: number[] = [];
  for (const raw of names) {
    const name = raw.trim().toLowerCase();
    if (!name) continue;
    if (!keywordIdCache.has(name)) {
      const data = await tmdbFetch<{ results?: Array<{ id: number; name: string }> }>(
        "/search/keyword",
        { query: name },
        TMDB_TTL.search,
      ).catch(() => null);
      // Prefer an exact name match, else the first (most relevant) result.
      const hit =
        (data?.results ?? []).find((r) => r.name.toLowerCase() === name) ??
        (data?.results ?? [])[0] ??
        null;
      keywordIdCache.set(name, hit ? hit.id : null);
    }
    const id = keywordIdCache.get(name);
    if (id != null) out.push(id);
  }
  return out;
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
  original_language: string; // ISO 639-1, e.g. "en", "ja", "hi"
}

/**
 * Richer discover for the Settle It pool — returns the fields the couch
 * needs (title, poster, overview, genres) with runtime filtered at query
 * time so results always respect a "keep it short" constraint.
 */
export async function discoverSettleCandidates(opts: {
  genreIds: number[];
  /** OR-joined with_keywords — sources by tone for a channel keyword reel. */
  keywordIds?: number[];
  obscurityMin: number;
  obscurityMax: number;
  maxRuntime?: number;
  page?: number;
  /** Genres that break the channel's tone (comma = exclude ANY of these). */
  withoutGenreIds?: number[];
  /** YYYY-MM-DD ceiling — a real deep cut has had time to become one. */
  releasedBefore?: string;
  /** YYYY-MM-DD floor — for a "recent gems" pull that balances the era mix. */
  releasedAfter?: string;
  /** TMDB vote_average floor — obscure should not mean bad. */
  minRating?: number;
  /** "vote_average.desc" surfaces most-loved-least-seen; "vote_count.asc" walks
   *  the vault deepest-cut-first (both keep the vote_average floor enforced
   *  server-side, so the deep end is not unrated junk). */
  sortBy?: "popularity.desc" | "vote_average.desc" | "vote_count.asc";
  /** Feature-length floor — keeps TV specials, shorts, and music videos out. */
  minRuntime?: number;
  /** TMDB watch-provider ids — filter to films streamable on these (flatrate). */
  watchProviderIds?: number[];
  /** ISO 3166-1 alpha-2. Which country's catalogue to ask about. */
  region: string;
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
  if (opts.keywordIds?.length) qs.with_keywords = opts.keywordIds.join("|");
  if (opts.maxRuntime) qs["with_runtime.lte"] = String(opts.maxRuntime);
  if (opts.withoutGenreIds?.length) qs.without_genres = opts.withoutGenreIds.join(",");
  if (opts.releasedBefore) qs["primary_release_date.lte"] = opts.releasedBefore;
  if (opts.releasedAfter) qs["primary_release_date.gte"] = opts.releasedAfter;
  if (opts.minRating) qs["vote_average.gte"] = String(opts.minRating);
  if (opts.minRuntime) qs["with_runtime.gte"] = String(opts.minRuntime);
  if (opts.watchProviderIds?.length) {
    // "|" = available on ANY of my services; flatrate = included with the sub
    // (not rent/buy), scoped to the member's own catalogue.
    qs.with_watch_providers = opts.watchProviderIds.join("|");
    qs.watch_region = opts.region.toUpperCase();
    qs.with_watch_monetization_types = "flatrate";
  }

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
      original_language?: string;
    }>;
  }
  const data = await tmdbFetch<Payload>("/discover/movie", qs, TMDB_TTL.discover).catch(
    () => null,
  );
  return (data?.results ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    year: r.release_date ? Number(r.release_date.slice(0, 4)) : null,
    poster_path: r.poster_path,
    overview: r.overview ?? "",
    genre_ids: r.genre_ids ?? [],
    vote_count: r.vote_count,
    popularity: r.popularity,
    original_language: r.original_language ?? "en",
  }));
}

/**
 * A film's TMDB keywords — its tonal DNA ("time loop", "found family",
 * "revenge"). Genres say what shelf a film sits on; keywords say what it's
 * actually about, which is what "This Meets That" splices together.
 */
export async function getMovieKeywords(
  tmdbId: number,
): Promise<Array<{ id: number; name: string }>> {
  const data = await tmdbFetch<{ keywords?: Array<{ id: number; name: string }> }>(
    `/movie/${tmdbId}/keywords`,
  ).catch(() => null);
  return data?.keywords ?? [];
}

/**
 * "More like this" from TMDB's own recommendation graph for a seed film.
 * We use /recommendations (a curated co-watch graph) over /similar (raw keyword
 * overlap, much noisier). The rec engine seeds these from films the user LOVED,
 * then filters them to the user's obscurity band so only the deep cuts survive —
 * "films in the vein of what you love that you probably haven't heard of."
 */
export async function getSimilarMovies(tmdbId: number, page = 1): Promise<DiscoverResult[]> {
  const data = await tmdbFetch<{
    results?: Array<{ id: number; vote_count: number; vote_average: number; popularity: number }>;
  }>(`/movie/${tmdbId}/recommendations`, { language: "en-US", page: String(page) }).catch(
    () => null,
  );
  return (data?.results ?? []).map((r) => ({
    id: r.id,
    vote_count: r.vote_count,
    vote_average: r.vote_average,
    popularity: r.popularity,
  }));
}

export async function discoverMovies(opts: DiscoverOpts): Promise<DiscoverResult[]> {
  const band = voteBandForObscurity(opts.obscurityMin, opts.obscurityMax);
  const qs: Record<string, string> = {
    include_adult: "false",
    include_video: "false",
    language: "en-US",
    watch_region: opts.region.toUpperCase(),
    sort_by: opts.sortBy ?? "popularity.desc",
    "vote_count.gte": String(Math.max(band.gte, opts.minVotes ?? 0)),
    page: String(opts.page ?? 1),
  };
  if (band.lte != null) qs["vote_count.lte"] = String(band.lte);
  if (opts.genreIds?.length) qs.with_genres = opts.genreIds.join("|"); // OR
  if (opts.keywordIds?.length) qs.with_keywords = opts.keywordIds.join("|"); // OR — tone
  if (opts.withoutGenreIds?.length) qs.without_genres = opts.withoutGenreIds.join(","); // exclude ANY
  if (opts.minRating) qs["vote_average.gte"] = String(opts.minRating);
  if (opts.releasedBefore) qs["primary_release_date.lte"] = opts.releasedBefore;
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
  const data = await tmdbFetch<DiscoverPayload>("/discover/movie", qs, TMDB_TTL.discover).catch(
    () => null,
  );
  return (data?.results ?? []).map((r) => ({
    id: r.id,
    vote_count: r.vote_count,
    vote_average: r.vote_average,
    popularity: r.popularity,
  }));
}
