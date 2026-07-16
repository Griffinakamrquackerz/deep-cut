import type { MovieRatings } from "@/lib/tmdb";

// Shows whatever ratings are available. IMDb + Rotten Tomatoes come from OMDb
// (needs OMDB_API_KEY); TMDB is always present as a baseline.
export default function RatingsBadges({
  ratings,
  className = "",
}: {
  ratings?: Partial<MovieRatings> | null;
  className?: string;
}) {
  if (!ratings) return null;
  const { imdb, rt, tmdb } = ratings;
  if (imdb == null && rt == null && tmdb == null) return null;

  return (
    <span className={`flex flex-wrap items-center gap-2 font-mono text-[0.65rem] ${className}`}>
      {imdb != null && (
        <span className="text-amber" title="IMDb rating">
          <span className="font-semibold">IMDb</span> {imdb.toFixed(1)}
        </span>
      )}
      {rt != null && (
        <span className={rt >= 60 ? "text-avail" : "text-ticket"} title="Rotten Tomatoes">
          🍅 {rt}%
        </span>
      )}
      {/* TMDB shown when OMDb ratings aren't available, so there's always a score */}
      {imdb == null && rt == null && tmdb != null && (
        <span className="text-dim" title="TMDB rating">
          ★ {tmdb.toFixed(1)}
        </span>
      )}
    </span>
  );
}
