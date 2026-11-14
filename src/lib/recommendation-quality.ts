import { gemScore } from "./gem";
import { effectiveObscurity } from "./obscurity";

// Editorial rating exceptions, not an inferred "cult" classifier. A model's
// description, TMDB keyword or high vote count cannot add a film to this list.
// IDs/title/year verified against TMDB on 2026-09-17; reception sources below.
export const CULT_RATING_EXCEPTIONS = [
  {
    id: 17473, title: "The Room", year: 2003,
    evidence: "Long-running audience-participation midnight screenings; celebrated for its unintentional comedy.",
    source: "https://en.wikipedia.org/wiki/The_Room#Midnight_circuit",
  },
  {
    id: 26914, title: "Troll 2", year: 1990,
    evidence: "So-bad-it-is-good cult following and revival screenings documented in Best Worst Movie.",
    source: "https://en.wikipedia.org/wiki/Troll_2#Documentary",
  },
] as const;

export const MIN_RECOMMENDATION_RATING = 6.5;

interface RatedMovie {
  id: number;
  year: number | null;
  ratings?: { imdb?: number | null; tmdb?: number | null };
}

/** Rating gate only. History, obscurity, mood and classic quotas still apply. */
export function passesRecommendationRating(movie: RatedMovie): boolean {
  if (CULT_RATING_EXCEPTIONS.some((entry) => entry.id === movie.id && entry.year === movie.year)) return true;
  // Never cherry-pick the higher source: a present IMDb rating controls the
  // decision, even when TMDB likes the film more. Invalid present data fails.
  const rating = movie.ratings?.imdb ?? movie.ratings?.tmdb;
  return typeof rating === "number" && Number.isFinite(rating)
    && rating >= MIN_RECOMMENDATION_RATING && rating <= 10;
}

/**
 * Selection ranking: acclaim measured against reach (the old gem signal, from
 * gem.ts) — "better than anything you've seen, and you've never heard of it".
 * Arrival order is not a taste ordering: the model lists films in the order it
 * thought of them and TMDB returns pages in vote-average order, so neither
 * should decide what a batch's slots go to. Unrated films rank lowest (0) but
 * stay eligible — the rating gate above handles quality, this only orders.
 */
export function gemRank(movie: {
  vote_count?: number | null;
  imdb_votes?: number | null;
  ratings?: { imdb?: number | null; tmdb?: number | null; rt?: number | null } | null;
}): number {
  return gemScore({
    imdb_rating: movie.ratings?.imdb,
    vote_average: movie.ratings?.tmdb,
    rt_rating: movie.ratings?.rt,
    imdb_votes: movie.imdb_votes,
    vote_count: movie.vote_count ?? 0,
  }) ?? 0;
}

/** Stable sort by gemRank — ties keep their original order. */
export function byGemScore<T>(items: T[], pick: (item: T) => Parameters<typeof gemRank>[0]): T[] {
  return items
    .map((item, index) => ({ item, index, rank: gemRank(pick(item)) }))
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .map(({ item }) => item);
}

type RecommendationFitInput =
  Parameters<typeof effectiveObscurity>[0] &
  Parameters<typeof gemRank>[0];

/** Quality leads; the obscurity dial is a soft preference within the pool. */
export function byRecommendationFit<T>(
  items: T[],
  pick: (item: T) => RecommendationFitInput,
  target: number,
): T[] {
  return items
    .map((item, index) => {
      const movie = pick(item);
      const distance = Math.abs(effectiveObscurity(movie) - target);
      return { item, index, rank: gemRank(movie) * 3 + (2 - distance) };
    })
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .map(({ item }) => item);
}

/** Reorder each existing batch softly without moving older batches above newer ones. */
export function byRecommendationPreference<T extends {
  obscurity: number;
  gem?: number | null;
  status: string;
  batch?: number;
}>(items: T[], target: number): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = `${item.status}:${item.batch ?? 0}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap((group) =>
    group
      .map((item, index) => ({
        item,
        index,
        rank: (item.gem ?? 0) * 3 + (2 - Math.abs(item.obscurity - target)),
      }))
      .sort((a, b) => b.rank - a.rank || a.index - b.index)
      .map(({ item }) => item),
  );
}
