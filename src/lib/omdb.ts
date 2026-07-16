// OMDb API — IMDb rating + Rotten Tomatoes score by IMDb id.
// Optional: set OMDB_API_KEY (free at https://www.omdbapi.com/apikey.aspx).
// When absent, the app falls back to TMDB's own rating.

export interface OmdbRatings {
  imdb: number | null; // /10
  rt: number | null; // 0-100 (Rotten Tomatoes %)
}

interface OmdbResponse {
  Response: string;
  imdbRating?: string;
  Ratings?: Array<{ Source: string; Value: string }>;
}

export function omdbConfigured(): boolean {
  return !!process.env.OMDB_API_KEY;
}

/** Look up IMDb + Rotten Tomatoes for an IMDb id (ttXXXXXXX). Returns nulls on any failure. */
export async function getOmdbRatings(imdbId: string): Promise<OmdbRatings> {
  const key = process.env.OMDB_API_KEY;
  if (!key || !imdbId) return { imdb: null, rt: null };

  try {
    const res = await fetch(
      `https://www.omdbapi.com/?apikey=${encodeURIComponent(key)}&i=${encodeURIComponent(imdbId)}`,
    );
    if (!res.ok) return { imdb: null, rt: null };
    const data = (await res.json()) as OmdbResponse;
    if (data.Response !== "True") return { imdb: null, rt: null };

    const imdb = data.imdbRating && data.imdbRating !== "N/A" ? Number(data.imdbRating) : null;
    const rtEntry = data.Ratings?.find((r) => r.Source === "Rotten Tomatoes");
    const rt = rtEntry ? Number(rtEntry.Value.replace("%", "")) : null;

    return {
      imdb: imdb != null && Number.isFinite(imdb) ? imdb : null,
      rt: rt != null && Number.isFinite(rt) ? rt : null,
    };
  } catch {
    return { imdb: null, rt: null };
  }
}
