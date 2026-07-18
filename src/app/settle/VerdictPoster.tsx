"use client";
import { useEffect, useState } from "react";
import Poster from "@/components/Poster";

// Module-level cache so re-rolls / revisits never refetch the same poster.
const posterCache = new Map<string, string | null>();

/**
 * Settle films are mock data with no poster_path, so we resolve real TMDB
 * art on demand via the app's /api/search endpoint — matched by title + year
 * (±1). Falls back to Poster's typographic card while loading or on a miss.
 */
export default function VerdictPoster({
  title,
  year,
  genres,
  knownPoster,
}: {
  title: string;
  year: number;
  genres: string[];
  knownPoster?: string | null; // real-data films arrive with their poster
}) {
  const key = `${title}|${year}`;
  const [posterPath, setPosterPath] = useState<string | null>(
    knownPoster ?? posterCache.get(key) ?? null,
  );

  useEffect(() => {
    if (knownPoster) {
      setPosterPath(knownPoster);
      return;
    }
    if (posterCache.has(key)) {
      setPosterPath(posterCache.get(key) ?? null);
      return;
    }
    let cancelled = false;
    void fetch(`/api/search?q=${encodeURIComponent(title)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const results: Array<{ year: number | null; poster_path: string | null }> =
          data?.results ?? [];
        const hit =
          results.find((m) => m.year != null && Math.abs(m.year - year) <= 1 && m.poster_path) ??
          results.find((m) => m.poster_path);
        const path = hit?.poster_path ?? null;
        posterCache.set(key, path);
        if (!cancelled) setPosterPath(path);
      })
      .catch(() => {
        if (!cancelled) setPosterPath(null);
      });
    return () => {
      cancelled = true;
    };
  }, [key, title, year, knownPoster]);

  return <Poster posterPath={posterPath} title={title} year={year} genres={genres} />;
}
