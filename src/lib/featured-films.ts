import { unstable_cache } from "next/cache";
import { FEATURED_CANON, type CanonPick } from "./canon";
import { searchMovies } from "./tmdb";

export interface FeaturedFilm {
  title: string;
  year: number;
  id: number | null;
  posterPath: string | null;
  description: string;
}

type SearchResult = Awaited<ReturnType<typeof searchMovies>>[number];

export function matchFeaturedFilm(pick: CanonPick, results: SearchResult[]): SearchResult | undefined {
  const normalize = (title: string) => title.normalize("NFKC").toLocaleLowerCase().trim();
  const title = normalize(pick.t);
  return results.find(
    (result) =>
      result.year === pick.y &&
      [result.title, result.original_title].some((name) => name && normalize(name) === title),
  );
}

const resolveFeaturedFilm = unstable_cache(
  async (pick: CanonPick) => {
    const results = await searchMovies(pick.t, AbortSignal.timeout(4000));
    return matchFeaturedFilm(pick, results) ?? null;
  },
  ["featured-canon-film"],
  { revalidate: 86400 },
);

export async function getFeaturedFilms(): Promise<FeaturedFilm[]> {
  const unavailable = (pick: (typeof FEATURED_CANON)[number]): FeaturedFilm => ({
    title: pick.t, year: pick.y, id: null, posterPath: null, description: pick.note,
  });

  if (!process.env.TMDB_API_KEY) {
    console.error("Unable to load featured film posters: TMDB_API_KEY is not configured");
    return FEATURED_CANON.map(unavailable);
  }

  return Promise.all(
    FEATURED_CANON.map(async (pick) => {
      try {
        const movie = await resolveFeaturedFilm(pick);
        return {
          title: pick.t,
          year: pick.y,
          id: movie?.id ?? null,
          posterPath: movie?.poster_path ?? null,
          description: pick.note,
        };
      } catch (error) {
        console.error(`Unable to load featured film ${pick.t} (${pick.y})`, error);
        return unavailable(pick);
      }
    }),
  );
}
