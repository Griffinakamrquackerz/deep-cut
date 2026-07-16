/* Poster with typographic fallback card (genre-derived hue) when TMDB has none. */

const GENRE_HUES: Record<string, string> = {
  Horror: "#7a2e2e",
  Thriller: "#5c3a2e",
  Comedy: "#8a6d2f",
  Drama: "#4e4030",
  "Science Fiction": "#2f4e5c",
  Fantasy: "#4a3a5c",
  Animation: "#2f5c46",
  Romance: "#6d3a4e",
  Documentary: "#3a4a3a",
  Crime: "#3a3a4a",
  Western: "#6d5a2f",
  Music: "#5c2f5c",
};

export function fallbackHue(genres: string[]): string {
  for (const g of genres) if (GENRE_HUES[g]) return GENRE_HUES[g];
  return "#3b2e27";
}

export default function Poster({
  posterPath,
  title,
  year,
  genres = [],
  className = "",
}: {
  posterPath: string | null;
  title: string;
  year?: number | null;
  genres?: string[];
  className?: string;
}) {
  if (posterPath) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`https://image.tmdb.org/t/p/w342${posterPath}`}
        alt={`${title} poster`}
        loading="lazy"
        className={`aspect-[2/3] w-full rounded object-cover ${className}`}
      />
    );
  }
  return (
    <div
      aria-label={`${title} poster placeholder`}
      className={`flex aspect-[2/3] w-full flex-col justify-between rounded border border-line p-2 ${className}`}
      style={{ background: fallbackHue(genres) }}
    >
      <span className="font-display text-lg leading-tight text-cream">{title}</span>
      {year ? <span className="font-mono text-[0.6rem] text-cream/70">{year}</span> : null}
    </div>
  );
}
