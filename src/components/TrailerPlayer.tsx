"use client";
import { useState } from "react";

/**
 * Click-to-play trailer. Renders only a YouTube thumbnail until tapped —
 * loading the real iframe up front would drag ~1MB of YouTube JS into every
 * movie page and wreck the PWA's load time. youtube-nocookie keeps it lean.
 */
export default function TrailerPlayer({ videoKey, title }: { videoKey: string; title: string }) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className="poster-frame relative aspect-video w-full overflow-hidden rounded">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoKey}?autoplay=1&rel=0`}
          title={`${title} — trailer`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setPlaying(true)}
      className="poster-frame group relative block aspect-video w-full overflow-hidden rounded text-left"
      aria-label={`Play trailer for ${title}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumb, fixed remote host */}
      <img
        src={`https://img.youtube.com/vi/${videoKey}/hqdefault.jpg`}
        alt={`${title} trailer thumbnail`}
        decoding="async"
        loading="lazy"
        className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
      />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ticket/90 pl-1 font-display text-2xl text-cream shadow-lg">
          ▶
        </span>
      </span>
      <span className="absolute bottom-2 left-2 rounded bg-bg/80 px-2 py-1 font-mono text-[0.6rem] uppercase tracking-widest text-amber">
        Play trailer
      </span>
    </button>
  );
}
