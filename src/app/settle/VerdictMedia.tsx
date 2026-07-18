"use client";
import { useEffect, useRef, useState } from "react";
import Poster from "@/components/Poster";
import type { MovieRatings } from "@/lib/tmdb";

// Cache resolution + meta so re-rolls and revisits are instant.
const idCache = new Map<string, number | null>();
interface Meta {
  trailerKey: string | null;
  runtime: number | null;
  streaming: string[];
  ratings: MovieRatings | null;
}
const metaCache = new Map<number, Meta>();

/**
 * The verdict's spotlight: autoplays the film's trailer (muted, per browser
 * autoplay rules) the instant the ruling lands, with a tap to bring the
 * sound up. Falls back to the poster when TMDB has no trailer. Reports real
 * runtime + streaming up so the card shows them for curated films too.
 */
export default function VerdictMedia({
  title,
  year,
  genres,
  tmdbId,
  knownPoster,
  onMeta,
}: {
  title: string;
  year: number;
  genres: string[];
  tmdbId?: number;
  knownPoster?: string | null;
  onMeta?: (m: { runtime: number | null; streaming: string[]; ratings: MovieRatings | null }) => void;
}) {
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [posterPath, setPosterPath] = useState<string | null>(knownPoster ?? null);
  const [resolved, setResolved] = useState(false);
  const [unmuted, setUnmuted] = useState(false);
  const metaSent = useRef(false);

  const searchKey = `${title}|${year}`;

  useEffect(() => {
    metaSent.current = false;
    setUnmuted(false);
    let cancelled = false;

    async function run() {
      // 1. Resolve a TMDB id — from the prop, or by searching title + year.
      let id = tmdbId ?? idCache.get(searchKey) ?? null;
      if (id == null && !idCache.has(searchKey)) {
        try {
          const r = await fetch(`/api/search?q=${encodeURIComponent(title)}`);
          const results: Array<{ id: number; year: number | null; poster_path: string | null }> =
            r.ok ? (await r.json()).results ?? [] : [];
          const hit =
            results.find((m) => m.year != null && Math.abs(m.year - year) <= 1) ?? results[0];
          id = hit?.id ?? null;
          idCache.set(searchKey, id);
          if (hit?.poster_path && !cancelled) setPosterPath(hit.poster_path);
        } catch {
          id = null;
        }
      }
      if (cancelled || id == null) {
        if (!cancelled) setResolved(true);
        return;
      }

      // 2. Fetch trailer + runtime + streaming for that id (cached).
      let meta = metaCache.get(id) ?? null;
      if (!meta) {
        try {
          const r = await fetch(`/api/settle/film?id=${id}`);
          meta = r.ok ? await r.json() : { trailerKey: null, runtime: null, streaming: [], ratings: null };
          metaCache.set(id, meta!);
        } catch {
          meta = { trailerKey: null, runtime: null, streaming: [], ratings: null };
        }
      }
      if (cancelled) return;
      setTrailerKey(meta!.trailerKey);
      setResolved(true);
      if (!metaSent.current) {
        metaSent.current = true;
        onMeta?.({ runtime: meta!.runtime, streaming: meta!.streaming, ratings: meta!.ratings });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey, tmdbId]);

  if (trailerKey) {
    const src =
      `https://www.youtube-nocookie.com/embed/${trailerKey}` +
      `?autoplay=1&mute=${unmuted ? 0 : 1}&playsinline=1&rel=0&modestbranding=1&loop=1&playlist=${trailerKey}`;
    return (
      <div className="poster-frame relative aspect-video w-full overflow-hidden rounded">
        <iframe
          key={String(unmuted)} // reload with sound on the unmute tap (a user gesture)
          src={src}
          title={`${title} — trailer`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
        {!unmuted && (
          <button
            onClick={() => setUnmuted(true)}
            className="absolute bottom-2 right-2 rounded-full border border-amber bg-bg/80 px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-widest text-amber backdrop-blur"
          >
            🔇 Tap for sound
          </button>
        )}
      </div>
    );
  }

  // No trailer (yet, or none exists) → poster spotlight.
  return (
    <div className="mx-auto w-40">
      <Poster
        posterPath={posterPath}
        title={title}
        year={year}
        genres={genres}
        className={resolved ? "" : "animate-pulse"}
      />
    </div>
  );
}
