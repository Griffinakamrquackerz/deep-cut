// OMDb API — IMDb rating + Rotten Tomatoes score by IMDb id.
// Optional: set OMDB_API_KEY (free at https://www.omdbapi.com/apikey.aspx).
// When absent, the app falls back to TMDB's own rating.

export interface OmdbRatings {
  imdb: number | null; // /10
  rt: number | null; // 0-100 (Rotten Tomatoes %)
  /**
   * IMDb vote count — how many people have actually MET the film. Far and away
   * the best fame signal we can get: TMDB's voters skew cinephile and barely
   * log big streaming releases, so a $75m Apple TV+ title can sit at 786 TMDB
   * votes (and score as a deep cut) while carrying 50k+ on IMDb.
   */
  votes: number | null;
}

interface OmdbResponse {
  Response: string;
  imdbRating?: string;
  imdbVotes?: string; // comma-grouped, e.g. "52,341"
  Ratings?: Array<{ Source: string; Value: string }>;
}

export function omdbConfigured(): boolean {
  return !!process.env.OMDB_API_KEY;
}

/** Look up IMDb + Rotten Tomatoes for an IMDb id (ttXXXXXXX). Returns nulls on any failure. */
export async function getOmdbRatings(imdbId: string): Promise<OmdbRatings> {
  const key = process.env.OMDB_API_KEY;
  if (!key || !imdbId) return { imdb: null, rt: null, votes: null };

  try {
    // IMDb/RT scores drift over weeks, not hours, and this is the third
    // network hop in cacheMovie's path — a day of caching is free latency.
    const res = await fetch(
      `https://www.omdbapi.com/?apikey=${encodeURIComponent(key)}&i=${encodeURIComponent(imdbId)}`,
      { next: { revalidate: 86_400 } },
    );
    if (!res.ok) return { imdb: null, rt: null, votes: null };
    const data = (await res.json()) as OmdbResponse;
    if (data.Response !== "True") return { imdb: null, rt: null, votes: null };

    const imdb = data.imdbRating && data.imdbRating !== "N/A" ? Number(data.imdbRating) : null;
    const rtEntry = data.Ratings?.find((r) => r.Source === "Rotten Tomatoes");
    const rt = rtEntry ? Number(rtEntry.Value.replace("%", "")) : null;
    const votes =
      data.imdbVotes && data.imdbVotes !== "N/A"
        ? Number(data.imdbVotes.replace(/,/g, ""))
        : null;

    return {
      imdb: imdb != null && Number.isFinite(imdb) ? imdb : null,
      rt: rt != null && Number.isFinite(rt) ? rt : null,
      votes: votes != null && Number.isFinite(votes) ? votes : null,
    };
  } catch {
    return { imdb: null, rt: null, votes: null };
  }
}
