"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import MarqueeBulbs from "@/components/MarqueeBulbs";
import AdSlot from "@/components/AdSlot";
import { sfxClick, sfxPop } from "@/lib/sfx";
import { VIBES, type Vibe } from "@/lib/vibes";
import type { Service } from "@/lib/services";

// "Just Roll It" — the lean-back channel. Pick a channel, then stop deciding:
// trailers for deep cuts roll one after another until something grabs you.
// No accounts, no choices, pure late-night cable energy.

interface ChannelFilm {
  id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  overview: string;
  /** hand-programmed house-canon pick, not an algorithm find */
  canon?: boolean;
}

const TRAILER_SECONDS = 45; // auto-advance pacing with a trailer playing
const POSTER_SECONDS = 12; // faster flip when we only have a poster card

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function RollChannel({
  myServices = [],
  premium = false,
}: {
  myServices?: Service[];
  /** Members don't see ads. This screen used to be the one that forgot. */
  premium?: boolean;
}) {
  const [channel, setChannel] = useState<Vibe | null>(null);
  const [queue, setQueue] = useState<ChannelFilm[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [mineOnly, setMineOnly] = useState(false); // "only on my platforms"
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  // Trailer keys by movie id: undefined = not fetched, null = none found.
  const [trailers, setTrailers] = useState<Record<number, string | null>>({});
  const trailersRef = useRef(trailers);
  trailersRef.current = trailers;

  const film = queue[idx] ?? null;
  const trailerKey = film ? trailers[film.id] : undefined;
  const limit = trailerKey ? TRAILER_SECONDS : POSTER_SECONDS;

  const fetchTrailer = useCallback(async (movieId: number) => {
    if (trailersRef.current[movieId] !== undefined) return;
    const data = await fetch(`/api/settle/film?id=${movieId}`)
      .then((r) => r.json())
      .catch(() => null);
    setTrailers((prev) => ({ ...prev, [movieId]: (data?.trailerKey as string | null) ?? null }));
  }, []);

  async function tune(v: Vibe) {
    sfxClick();
    setChannel(v);
    setLoading(true);
    setError(null);
    // The channel's own pool: hand-programmed house canon spliced with a
    // most-loved-least-seen discover reel (tuning lives server-side).
    const res = await fetch("/api/roll/pool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vibe: v.key,
        // Random slice per tune-in — the channel shouldn't rerun last night's lineup.
        pageStart: 1 + Math.floor(Math.random() * 3),
        myServicesOnly: mineOnly,
      }),
    }).catch(() => null);
    const data = res?.ok ? await res!.json().catch(() => null) : null;
    const films = (data?.candidates ?? []) as ChannelFilm[];
    if (!films.length) {
      setError(
        mineOnly
          ? "Nothing on your platforms in this channel right now — try another, or flip off “my platforms”."
          : "Static on that frequency — try another channel.",
      );
      setChannel(null);
      setLoading(false);
      return;
    }
    setQueue(shuffle(films));
    setIdx(0);
    setElapsed(0);
    setMuted(true);
    setLoading(false);
  }

  const next = useCallback(() => {
    setIdx((i) => (i + 1) % Math.max(queue.length, 1));
    setElapsed(0);
    setMuted(true);
  }, [queue.length]);

  // Rewind to the film you just skipped past. Clamps at the top of the reel.
  const prev = useCallback(() => {
    setIdx((i) => Math.max(0, i - 1));
    setElapsed(0);
    setMuted(true);
  }, []);

  // Fetch the current + next trailers (prefetch keeps the channel seamless).
  useEffect(() => {
    if (!film) return;
    void fetchTrailer(film.id);
    const upNext = queue[(idx + 1) % queue.length];
    if (upNext) void fetchTrailer(upNext.id);
  }, [film, idx, queue, fetchTrailer]);

  // The channel clock: tick once a second, flip when the segment runs out.
  useEffect(() => {
    if (!film) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [film, idx]);
  useEffect(() => {
    if (film && elapsed >= limit) next();
  }, [elapsed, limit, film, next]);

  // ── Channel guide ──────────────────────────────────────────────────
  if (!channel) {
    return (
      <main className="flex min-h-dvh flex-col gap-5 px-5 py-10">
        <header className="text-center">
          <MarqueeBulbs />
          <p className="eyebrow mt-2">Lean back</p>
          <h1 className="glow-amber neon-flicker font-display text-5xl text-amber">JUST ROLL IT</h1>
          <p className="mt-1 font-mono text-[0.65rem] text-dim">
            Pick a channel. We roll deep-cut trailers until one grabs you. No decisions.
          </p>
        </header>
        {error && <p className="text-center font-mono text-xs text-ticket">{error}</p>}
        {myServices.length > 0 && (
          <button
            onClick={() => {
              sfxPop();
              setMineOnly((v) => !v);
            }}
            aria-pressed={mineOnly}
            className={`mx-auto flex w-full max-w-sm items-center justify-center gap-2 rounded border px-4 py-2.5 font-mono text-[0.7rem] uppercase tracking-widest ${
              mineOnly ? "border-amber bg-amber/15 text-amber" : "border-line text-dim"
            }`}
          >
            📺 {mineOnly ? "Only on my platforms ✓" : "Only on my platforms"}
          </button>
        )}
        <div className="mx-auto grid w-full max-w-sm grid-cols-1 gap-2">
          {VIBES.map((v, i) => (
            <button
              key={v.key}
              onClick={() => void tune(v)}
              disabled={loading}
              className="flex items-center justify-between rounded border border-line bg-surface px-4 py-3.5 text-left disabled:opacity-60"
            >
              <span className="flex items-center gap-3">
                <span className="font-mono text-[0.6rem] text-dim">CH {String(i + 1).padStart(2, "0")}</span>
                <span className="font-display text-xl text-cream">
                  {v.emoji} {v.label.toUpperCase()}
                </span>
              </span>
              <span className="font-mono text-[0.6rem] uppercase tracking-widest text-amber">
                {loading ? "…" : "Tune in ▸"}
              </span>
            </button>
          ))}
        </div>
        <Link href="/" className="mt-2 text-center font-mono text-[0.65rem] uppercase tracking-widest text-dim underline">
          ← Back to the theater
        </Link>
      </main>
    );
  }

  if (!film) return null;
  const chNum = String(VIBES.findIndex((v) => v.key === channel.key) + 1).padStart(2, "0");
  const upNext = queue[(idx + 1) % queue.length];

  // ── On air ─────────────────────────────────────────────────────────
  return (
    <main className="flex min-h-dvh flex-col gap-4 px-5 py-8">
      <header className="flex items-center justify-between">
        <p className="font-mono text-[0.65rem] uppercase tracking-widest text-dim">
          CH {chNum} · {channel.emoji} {channel.label}
        </p>
        <p className="font-mono text-[0.6rem] uppercase tracking-widest text-ticket">
          <span className="blink">●</span> ON AIR
        </p>
      </header>

      {/* The screen */}
      <div key={film.id} className="deal-in">
        {trailerKey ? (
          <div className="poster-frame relative aspect-video w-full overflow-hidden rounded">
            <iframe
              key={`${film.id}-${muted ? "m" : "s"}`}
              src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=${muted ? 1 : 0}&rel=0&playsinline=1&controls=0&modestbranding=1`}
              title={`${film.title} — trailer`}
              allow="autoplay; encrypted-media"
              className="absolute inset-0 h-full w-full border-0"
            />
            {muted && (
              <button
                onClick={() => {
                  sfxPop();
                  setMuted(false);
                }}
                className="absolute bottom-2 right-2 rounded bg-bg/85 px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-widest text-amber"
              >
                🔊 Tap for sound
              </button>
            )}
          </div>
        ) : (
          <div className="poster-frame relative aspect-video w-full overflow-hidden rounded bg-surface">
            {film.poster_path ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`https://image.tmdb.org/t/p/w500${film.poster_path}`}
                alt={film.title}
                className="absolute inset-0 h-full w-full object-cover opacity-70"
              />
            ) : null}
            <span className="absolute inset-0 flex items-center justify-center font-mono text-[0.65rem] uppercase tracking-widest text-cream">
              {trailerKey === undefined ? "Tuning…" : "No trailer on file — intermission card"}
            </span>
          </div>
        )}
        {/* Segment progress — the channel's pulse */}
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-ticket transition-[width] duration-1000 ease-linear"
            style={{ width: `${Math.min(100, (elapsed / limit) * 100)}%` }}
          />
        </div>
      </div>

      <div>
        <p className="font-display text-3xl leading-tight text-cream">
          {film.title} <span className="font-mono text-sm text-dim">{film.year ?? ""}</span>
        </p>
        {film.canon && (
          <span className="mt-1 inline-block rounded-sm border border-amber bg-amber/10 px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.2em] text-amber">
            🎞 House pick — programmer&apos;s shelf
          </span>
        )}
        {film.overview && <p className="mt-1 line-clamp-2 text-sm text-dim">{film.overview}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Link
          href={`/m/${film.id}`}
          onClick={() => {
            sfxPop();
            // Soft taste spark — fire-and-forget; guests just 401 silently.
            void fetch("/api/signals", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ movieId: film.id, source: "roll_pick" }),
            }).catch(() => null);
          }}
          className="pulse-cta block w-full rounded bg-ticket px-4 py-3 text-center font-mono text-xs font-medium uppercase tracking-[0.2em] text-cream"
        >
          🎟 That&apos;s the one
        </Link>
        <div className="flex gap-2">
          <button
            onClick={() => {
              sfxClick();
              prev();
            }}
            disabled={idx === 0}
            aria-label="Previous trailer"
            className="flex-1 rounded border border-line px-4 py-3 font-mono text-xs uppercase tracking-widest text-dim disabled:opacity-40"
          >
            ◂ Back
          </button>
          <button
            onClick={() => {
              sfxClick();
              next();
            }}
            className="flex-1 rounded border border-amber px-4 py-3 font-mono text-xs uppercase tracking-widest text-amber"
          >
            Keep rolling ▸
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        {upNext && (
          <p className="truncate font-mono text-[0.6rem] uppercase tracking-widest text-dim">
            Up next: {upNext.title}
          </p>
        )}
        <button
          onClick={() => {
            sfxClick();
            setChannel(null);
            setQueue([]);
          }}
          className="shrink-0 font-mono text-[0.6rem] uppercase tracking-widest text-dim underline"
        >
          Change channel
        </button>
      </div>

      {!premium && <AdSlot index={2} className="mt-2" />}
    </main>
  );
}
