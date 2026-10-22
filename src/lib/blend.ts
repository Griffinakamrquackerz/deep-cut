// "This Meets That" — the splice.
//
// Someone names 2-3 films; we name the one that feels like their offspring.
// Two halves, deliberately:
//
//   1. The LLM knows WHY films combine — that Lion King + Titanic is a sweeping
//      myth about doomed love and inherited duty, not "a cartoon on a boat."
//      It gets each parent's genres, keywords, and plot as evidence.
//   2. TMDB knows what actually EXISTS. Every LLM pick is resolved against it
//      (models invent films), and the parents' recommendation graphs top the
//      list up so the game never comes back empty when the LLM is down.
//
// Same shape as the rec engine: smart pass first, bottomless well behind it.

import { generateBlendPicks, type BlendParent } from "./ai";
import { effectiveObscurity } from "./obscurity";
import {
  cacheMovie,
  getMovieKeywords,
  getSimilarMovies,
  resolveTitleYear,
  type CachedMovie,
} from "./tmdb";

const TARGET_PICKS = 6;
const CLASSIC_YEAR = 1970;
const CLASSIC_MAX = 1;

export interface BlendSeed {
  id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
}

export interface BlendResult {
  id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  overview: string;
  genres: string[];
  reason: string;
  tmdb_rating: number | null;
  imdb_rating: number | null;
  rt_rating: number | null;
  /** true when the structured pull found it, not the LLM — a wilder swing. */
  fromVault?: boolean;
}

/**
 * How the smart pass actually went. Surfaced behind ?debug=1 on the route:
 * an all-vault result looks identical to a working one from outside, and
 * "the LLM quietly threw" is exactly the failure worth being able to see.
 */
export interface LlmOutcome {
  ok: boolean;
  /** Candidates the model named. */
  returned: number;
  /** How many survived TMDB validation and the house rules. */
  kept: number;
  error?: string;
}

const TITLE_STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "in", "on", "to", "part", "ii", "iii", "movie", "film",
]);

/** Significant lowercase words in a title — the basis of the franchise check. */
function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !TITLE_STOPWORDS.has(w)),
  );
}

/**
 * Is this candidate just a sequel or franchise sibling of one of the parents?
 *
 * TMDB's recommendation graph is dense with a film's own franchise, so the
 * fallback happily answered Rocky + Eternal Sunshine with "Rocky Balboa" and
 * Jurassic Park + Lost in Translation with "Jurassic World". A shared
 * significant word is a crude but effective tell, and for a fallback tier a
 * false negative costs nothing.
 */
function sameFranchise(candidate: string, parents: string[]): boolean {
  const c = titleTokens(candidate);
  return parents.some((p) => {
    for (const w of titleTokens(p)) if (c.has(w)) return true;
    return false;
  });
}

/** The parent films, read for the prompt. */
interface BlendDna {
  parents: BlendParent[];
  seeds: BlendSeed[];
}

/**
 * Read each parent film: cached details + its TMDB keywords. Keywords go to the
 * model as evidence — genres say what shelf a film sits on, keywords say what
 * it's actually about ("time loop", "found family", "revenge").
 */
async function readDna(movieIds: number[]): Promise<BlendDna | null> {
  const loaded = (
    await Promise.all(
      movieIds.map(async (id) => {
        const movie = await cacheMovie(id).catch(() => null);
        if (!movie) return null;
        const keywords = await getMovieKeywords(id).catch(() => []);
        return { movie, keywords };
      }),
    )
  ).filter((x): x is { movie: CachedMovie; keywords: Array<{ id: number; name: string }> } => x !== null);

  if (loaded.length === 0) return null;

  return {
    seeds: loaded.map(({ movie }) => ({
      id: movie.id,
      title: movie.title,
      year: movie.year,
      poster_path: movie.poster_path,
    })),
    parents: loaded.map(({ movie, keywords }) => ({
      title: movie.title,
      year: movie.year,
      genres: movie.genres,
      keywords: keywords.map((k) => k.name),
      overview: movie.overview,
    })),
  };
}

function toResult(movie: CachedMovie, reason: string, fromVault = false): BlendResult {
  return {
    id: movie.id,
    title: movie.title,
    year: movie.year,
    poster_path: movie.poster_path,
    overview: movie.overview,
    genres: movie.genres,
    reason,
    tmdb_rating: movie.ratings.tmdb,
    imdb_rating: movie.ratings.imdb,
    rt_rating: movie.ratings.rt,
    fromVault,
  };
}

/**
 * Splice 2-3 films. Returns the offspring, best match first, or an empty list
 * when nothing survives (the route turns that into a friendly miss).
 */
export async function blendMovies(
  movieIds: number[],
): Promise<{ seeds: BlendSeed[]; picks: BlendResult[]; llm: LlmOutcome }> {
  const dna = await readDna(movieIds);
  if (!dna) return { seeds: [], picks: [], llm: { ok: false, returned: 0, kept: 0 } };

  const picks: BlendResult[] = [];
  // Never return a parent as its own child.
  const used = new Set<number>(dna.seeds.map((s) => s.id));
  let classicCount = 0;

  // A pick has to be real, unseen in this batch, and respect the house rule
  // that the vault leans modern (one true classic per batch, no more).
  const accept = (movie: CachedMovie | null): movie is CachedMovie => {
    if (!movie || used.has(movie.id)) return false;
    if (movie.year != null && movie.year < CLASSIC_YEAR && classicCount >= CLASSIC_MAX) return false;
    return true;
  };
  const keep = (movie: CachedMovie, reason: string, fromVault = false) => {
    used.add(movie.id);
    if (movie.year != null && movie.year < CLASSIC_YEAR) classicCount++;
    picks.push(toResult(movie, reason, fromVault));
  };

  // ── 1. The smart pass ────────────────────────────────────────────
  const llm: LlmOutcome = { ok: false, returned: 0, kept: 0 };
  try {
    const { picks: generated } = await generateBlendPicks(dna.parents);
    llm.ok = true;
    llm.returned = generated.picks.length;
    const resolved = await Promise.all(
      generated.picks.map(async (p) => {
        const id = await resolveTitleYear(p.title, p.year).catch(() => null);
        if (!id) return null; // models invent films; TMDB is the arbiter
        const movie = await cacheMovie(id).catch(() => null);
        return movie ? { movie, reason: p.reason } : null;
      }),
    );
    // Keep the model's ranking — it ordered them most-convincing first.
    for (const r of resolved) {
      if (picks.length >= TARGET_PICKS) break;
      if (r && accept(r.movie)) {
        keep(r.movie, r.reason);
        llm.kept++;
      }
    }
  } catch (err) {
    llm.error = String(err instanceof Error ? err.message : err).slice(0, 200);
    console.error("blendMovies: LLM pass failed, using the graph intersection", err);
  }

  // ── 2. Recommendation-graph intersection (top-up / no-LLM fallback) ──
  // A film that appears in MORE THAN ONE parent's TMDB "more like this" list
  // genuinely relates to both — that overlap is the closest thing to a blend
  // you can compute without a model, and it's ranked by how many parents
  // reach it.
  //
  // This replaced a keyword pull that OR-joined the parents' tags and sorted
  // by rating. Whenever no keyword was shared (the norm for unrelated films)
  // it degraded to "highest-rated film carrying any one of these tags", which
  // returned The Godfather Part II for Pulp Fiction + Amélie, for Rocky +
  // Eternal Sunshine, for Blade Runner + The Notebook — the same famous film
  // for every combination, which is the opposite of a splice.
  try {
    if (picks.length < TARGET_PICKS) {
      const lists = await Promise.all(
        dna.seeds.map((s) => getSimilarMovies(s.id).catch(() => [])),
      );
      // movie id → the parent titles whose graph reaches it
      const reachedBy = new Map<number, string[]>();
      lists.forEach((list, i) => {
        const title = dna.seeds[i].title;
        for (const id of new Set(list.map((r) => r.id))) {
          reachedBy.set(id, [...(reachedBy.get(id) ?? []), title]);
        }
      });

      const ranked = [...reachedBy.entries()]
        .filter(([id]) => !used.has(id))
        .sort((a, b) => b[1].length - a[1].length) // shared by most parents first
        .slice(0, 16);

      const cached = await Promise.all(
        ranked.map(async ([id, parents]) => ({
          movie: await cacheMovie(id).catch(() => null),
          parents,
        })),
      );

      const parentTitles = dna.seeds.map((s) => s.title);
      for (const { movie, parents: reached } of cached) {
        if (picks.length >= TARGET_PICKS) break;
        if (!accept(movie)) continue;
        // TMDB's graph skews popular; keep the blockbuster tier out so a
        // fallback pick still feels like a Deep Cut answer.
        if (effectiveObscurity(movie) < 2 || sameFranchise(movie.title, parentTitles)) {
          used.add(movie.id);
          continue;
        }
        keep(
          movie,
          reached.length > 1
            ? `Turns up for both ${reached.slice(0, 2).join(" and ")}.`
            : `In the same orbit as ${reached[0]}.`,
          true,
        );
      }
    }
  } catch (err) {
    console.error("blendMovies: recommendation intersection failed", err);
  }

  return { seeds: dna.seeds, picks, llm };
}
