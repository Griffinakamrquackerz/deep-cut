"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Avatar from "./Avatar";
import { sfxChime, sfxPop, haptic } from "@/lib/sfx";
import { toast } from "@/lib/toast";

const TAKE_MAX = 250;

interface Take {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; handle: string | null; displayName: string | null; avatarUrl: string | null };
  movie: { id: number; title: string; year: number | null; posterPath: string | null } | null;
  fires: number;
  fights: number;
  myReaction: "fire" | "fight" | null;
  mine: boolean;
}

interface FilmHit {
  id: number;
  title: string;
  year: number | null;
}

function ago(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

/**
 * The Hot Takes wall — 250 characters of nitrate-burning opinion, pinned to a
 * film. 🔥 to agree, 🥊 to demand pistols at dawn. Lives in Community and on
 * every movie page (pass movieId to scope + lock the composer to that film).
 */
export default function HotTakesWall({
  movieId,
  movieTitle,
  signedIn = true,
}: {
  movieId?: number;
  movieTitle?: string;
  signedIn?: boolean;
}) {
  const [takes, setTakes] = useState<Take[] | null>(null);
  const [body, setBody] = useState("");
  const [film, setFilm] = useState<FilmHit | null>(
    movieId ? { id: movieId, title: movieTitle ?? "this film", year: null } : null,
  );
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<FilmHit[]>([]);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    const qs = movieId ? `?movieId=${movieId}` : "";
    const data = await fetch(`/api/takes${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setTakes((data?.takes as Take[]) ?? []);
  }, [movieId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function search(q: string) {
    setQuery(q);
    if (!q.trim()) return setHits([]);
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`).catch(() => null);
    if (res?.ok) setHits(((await res.json()).results ?? []).slice(0, 6));
  }

  async function post() {
    if (!film || body.trim().length < 2 || posting) return;
    setPosting(true);
    const res = await fetch("/api/takes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movieId: film.id, body: body.trim() }),
    }).catch(() => null);
    setPosting(false);
    if (res?.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (res?.status === 429) {
      toast("15 takes a day — let the nitrate cool off.", { tone: "amber", icon: "🔥" });
      return;
    }
    if (!res?.ok) {
      toast("The wall rejected that one — try again.", { tone: "amber", icon: "✕" });
      return;
    }
    sfxChime();
    haptic([15, 20, 15]);
    toast("Posted. The nitrate is lit.", { tone: "ticket", icon: "🔥" });
    setBody("");
    if (!movieId) setFilm(null);
    setQuery("");
    void load();
  }

  async function react(t: Take, kind: "fire" | "fight") {
    if (!signedIn) {
      window.location.href = "/login";
      return;
    }
    const next = t.myReaction === kind ? null : kind;
    sfxPop();
    haptic(10);
    // Optimistic counts
    setTakes((prev) =>
      (prev ?? []).map((x) => {
        if (x.id !== t.id) return x;
        const fires = x.fires + (next === "fire" ? 1 : 0) - (x.myReaction === "fire" ? 1 : 0);
        const fights = x.fights + (next === "fight" ? 1 : 0) - (x.myReaction === "fight" ? 1 : 0);
        return { ...x, fires, fights, myReaction: next };
      }),
    );
    await fetch("/api/takes/react", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ takeId: t.id, kind: next }),
    }).catch(() => null);
  }

  async function remove(t: Take) {
    setTakes((prev) => (prev ?? []).filter((x) => x.id !== t.id));
    await fetch(`/api/takes?id=${t.id}`, { method: "DELETE" }).catch(() => null);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Composer */}
      {signedIn && (
        <div className="ticket-edge rounded bg-surface p-3">
          <p className="eyebrow mb-2 text-ticket">🔥 Drop a take</p>
          {!movieId &&
            (film ? (
              <button
                onClick={() => {
                  setFilm(null);
                  setQuery("");
                }}
                className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-amber px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-wider text-amber"
              >
                🎬 {film.title} {film.year ?? ""} <span className="text-dim">✕</span>
              </button>
            ) : (
              <div className="mb-2">
                <input
                  type="search"
                  value={query}
                  onChange={(e) => void search(e.target.value)}
                  placeholder="Which film are we fighting about?"
                  className="w-full rounded border border-line bg-bg px-3 py-2 text-sm text-cream placeholder:text-dim/60"
                />
                {hits.length > 0 && (
                  <ul className="mt-1 divide-y divide-line rounded border border-line bg-bg">
                    {hits.map((h) => (
                      <li key={h.id}>
                        <button
                          onClick={() => {
                            sfxPop();
                            setFilm(h);
                            setHits([]);
                          }}
                          className="flex w-full justify-between px-3 py-2 text-left text-sm text-cream"
                        >
                          <span>
                            {h.title} <span className="font-mono text-xs text-dim">{h.year ?? ""}</span>
                          </span>
                          <span className="text-amber">＋</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, TAKE_MAX))}
            placeholder={
              film
                ? `Your spiciest ${TAKE_MAX} characters on ${film.title}…`
                : "Pick a film, then light the match…"
            }
            rows={3}
            className="w-full rounded border border-line bg-bg px-3 py-2 text-sm text-cream placeholder:text-dim/60"
          />
          <div className="mt-2 flex items-center justify-between">
            <span
              className={`font-mono text-[0.6rem] ${body.length > TAKE_MAX - 30 ? "text-ticket" : "text-dim"}`}
            >
              {body.length}/{TAKE_MAX}
            </span>
            <button
              onClick={() => void post()}
              disabled={!film || body.trim().length < 2 || posting}
              className="rounded bg-ticket px-4 py-2 font-mono text-xs font-medium uppercase tracking-widest text-cream disabled:opacity-40"
            >
              {posting ? "Striking match…" : "🔥 Post it"}
            </button>
          </div>
        </div>
      )}

      {/* The wall */}
      {takes === null ? (
        <p className="text-center font-mono text-xs text-dim">warming up the wall…</p>
      ) : takes.length === 0 ? (
        <div className="ticket-edge rounded p-6 text-center">
          <p className="neon-flicker font-display text-2xl text-amber">NO TAKES YET</p>
          <p className="mt-1 text-sm text-dim">
            Someone has to go first. Say the thing you can&apos;t say at dinner.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {takes.map((t) => {
            const name = t.author.handle
              ? `@${t.author.handle}`
              : (t.author.displayName ?? "someone");
            const scorching = t.fires >= 3;
            return (
              <li key={t.id} className="film-card relative rounded-lg p-3">
                {scorching && (
                  <span className="verdict-stamp pointer-events-none absolute -right-1 top-2 z-10 rotate-[8deg] text-sm">
                    SCORCHING
                  </span>
                )}
                <div className="flex items-start gap-2.5">
                  {t.movie?.posterPath ? (
                    <Link href={`/m/${t.movie.id}`} className="w-10 shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://image.tmdb.org/t/p/w154${t.movie.posterPath}`}
                        alt={t.movie.title}
                        className="rounded"
                      />
                    </Link>
                  ) : (
                    <Avatar url={t.author.avatarUrl} name={name} size="sm" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[0.6rem] uppercase tracking-wider text-dim">
                      <Link href={`/u/${t.author.handle ?? t.author.id}`} className="text-amber">
                        {name}
                      </Link>{" "}
                      on{" "}
                      {t.movie ? (
                        <Link href={`/m/${t.movie.id}`} className="text-cream underline">
                          {t.movie.title} {t.movie.year ?? ""}
                        </Link>
                      ) : (
                        "a film"
                      )}{" "}
                      · {ago(t.createdAt)}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-cream">“{t.body}”</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => void react(t, "fire")}
                        aria-pressed={t.myReaction === "fire"}
                        className={`rounded-full border px-2.5 py-1 font-mono text-[0.65rem] ${
                          t.myReaction === "fire"
                            ? "border-ticket bg-ticket/15 text-ticket"
                            : "border-line text-dim"
                        }`}
                      >
                        🔥 {t.fires}
                      </button>
                      <button
                        onClick={() => void react(t, "fight")}
                        aria-pressed={t.myReaction === "fight"}
                        className={`rounded-full border px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-wider ${
                          t.myReaction === "fight"
                            ? "border-amber bg-amber/15 text-amber"
                            : "border-line text-dim"
                        }`}
                      >
                        🥊 fight me {t.fights > 0 ? t.fights : ""}
                      </button>
                      {t.mine && (
                        <button
                          onClick={() => void remove(t)}
                          className="ml-auto font-mono text-[0.6rem] uppercase tracking-widest text-dim underline"
                        >
                          tear down
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
