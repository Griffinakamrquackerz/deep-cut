"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

// Now Showing — the television, cropped out of the basement photograph and set
// on Tonight where the morning-after card used to sit.
//
// Same image and same measurements as the room itself: the crop rectangle comes
// from the server, and where the screen falls inside that crop is derived from
// the room's screen rectangle rather than stored twice. Tune one, the other
// follows.
//
// The set changes channel on its own every few seconds. A static poster would
// have said "there are short films in here"; a television flipping through them
// says it while showing you three of them.

const FLIP_MS = 4200;

interface Short {
  id: string;
  title: string;
  director: string;
  year: number;
  runtimeSec: number;
  channels: string[];
  pedigree: string;
  thumb: string;
}
interface Scene {
  image: string | null;
  screen: { x: number; y: number; w: number; h: number };
  card: { x: number; y: number; w: number; h: number };
}
interface Channel {
  key: string;
  glyph: string;
  label: string;
}

export default function NowShowing() {
  const [films, setFilms] = useState<Short[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [scene, setScene] = useState<Scene | null>(null);
  const [at, setAt] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/shorts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setFilms(d.films ?? []);
        setChannels(d.channels ?? []);
        setScene(d.scene ?? null);
      })
      .catch(() => {});
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  useEffect(() => {
    // Reduced motion gets one film and no flipping — the rotation is flavour,
    // and flavour is never worth making someone feel unwell.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || films.length < 2) return;
    timer.current = setInterval(() => setAt((i) => (i + 1) % films.length), FLIP_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [films.length]);

  const film = films[at] ?? null;

  // The screen's place inside the crop, derived from the room's own numbers.
  const inCard = useMemo(() => {
    if (!scene) return null;
    const { screen: sc, card } = scene;
    return {
      x: (sc.x - card.x) / card.w,
      y: (sc.y - card.y) / card.h,
      w: sc.w / card.w,
      h: sc.h / card.h,
    };
  }, [scene]);

  if (!film || !scene?.image || !inCard) return null;

  const ch = channels.find((c) => film.channels.includes(c.key));
  const chNo = ch ? String(channels.indexOf(ch) + 1).padStart(2, "0") : "01";
  const { card } = scene;

  // The studio tour used to spotlight the theatre's door further down the
  // page. The door is gone, so the beat lands on this card instead — a beat
  // whose target has vanished waits three seconds before giving up on it.
  return (
    <Link
      href="/tv"
      data-usher="tv"
      aria-label={`Now showing ${film.title}. Open Deep Cut Theatre.`}
      className="block rounded border border-line bg-surface p-3"
    >
      <p className="eyebrow text-amber">
        📺 Now showing · CH {chNo} {ch ? ch.label : ""}
      </p>

      <div className="mt-2 flex gap-3">
        {/* Crop by oversizing the photograph and sliding it: the box shows the
            television and nothing else. */}
        <div
          className="relative h-[104px] w-[104px] shrink-0 overflow-hidden rounded-md bg-[#100c09]"
          style={{
            backgroundImage: `url(${scene.image})`,
            backgroundSize: `${100 / card.w}% ${100 / card.h}%`,
            backgroundPosition: `${(card.x / (1 - card.w)) * 100}% ${(card.y / (1 - card.h)) * 100}%`,
          }}
        >
          {/* The film's own frame, over the photograph's blue screen. */}
          <div
            key={film.id}
            className="deal-in absolute overflow-hidden bg-[#04050a]"
            style={{
              left: `${inCard.x * 100}%`,
              top: `${inCard.y * 100}%`,
              width: `${inCard.w * 100}%`,
              height: `${inCard.h * 100}%`,
              backgroundImage: `url(${film.thumb})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <span className="crt-scanlines absolute inset-0" />
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-center gap-0.5">
          <p className="font-display text-2xl leading-tight text-cream">
            {film.title.toUpperCase()}
          </p>
          <p className="font-mono text-[0.65rem] text-dim">
            {film.director} · {film.year} · {Math.round(film.runtimeSec / 60)} MIN
          </p>
          <p className="line-clamp-2 font-mono text-[0.6rem] leading-relaxed text-avail">
            🏆 {film.pedigree}
          </p>
          <p className="mt-1 font-mono text-[0.65rem] tracking-wide text-ticket">
            Pull up a beanbag →
          </p>
        </div>
      </div>
    </Link>
  );
}
