"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Poster from "./Poster";
import ObscurityDots from "./ObscurityDots";
import ServiceBadges from "./ServiceBadges";
import RatingsBadges from "./RatingsBadges";
import ReactionSheet, { type ReactionPayload } from "./ReactionSheet";
import FilmLeader from "./FilmLeader";
import MarqueeBulbs from "./MarqueeBulbs";
import AdSlot from "./AdSlot";
import Confetti from "./Confetti";
import { sfxChime, sfxClick, sfxPop } from "@/lib/sfx";
import { SERVICES, type Service } from "@/lib/services";
import { VIBES, vibeByKey } from "@/lib/vibes";

interface RecRow {
  id: string;
  reason: string;
  obscurity: number;
  status: string;
  movies: {
    id: number;
    title: string;
    year: number | null;
    runtime: number | null;
    poster_path: string | null;
    overview: string | null;
    genres: string[];
    providers: Partial<Record<Service, boolean>>;
    tmdb_rating: number | null;
    imdb_rating: number | null;
    rt_rating: number | null;
  } | null;
}

function availableServices(rec: RecRow): Service[] {
  const p = rec.movies?.providers ?? {};
  return SERVICES.filter((s) => p[s]);
}

export default function TonightScreen({ myServices }: { myServices: Service[] }) {
  const [recs, setRecs] = useState<RecRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dealing, setDealing] = useState(false);
  const [depth, setDepth] = useState(1); // obscurity dial: minimum obscurity
  const [mineOnly, setMineOnly] = useState(false);
  const [vibe, setVibe] = useState<string | null>(null);
  const [reacting, setReacting] = useState<RecRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch("/api/recs");
    if (res.ok) {
      const data = await res.json();
      setRecs((data.recs ?? []).filter((r: RecRow) => r.status === "active"));
    } else {
      // Never fail silently — an empty marquee must mean genuinely no recs.
      const data = await res.json().catch(() => null);
      setMessage(
        `Couldn't load your recs${data?.error ? `: ${String(data.error).slice(0, 200)}` : ""}.`,
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function deal() {
    sfxClick();
    setDealing(true);
    setMessage(null);
    const res = await fetch("/api/recs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        obscurityMin: depth,
        obscurityMax: 5,
        myServicesOnly: mineOnly,
        vibe,
      }),
    });
    if (res.status === 429) {
      setMessage("You've hit today's deal limit — back tomorrow.");
    } else if (!res.ok) {
      const data = await res.json().catch(() => null);
      const detail = data?.error ? `: ${String(data.error).slice(0, 200)}` : "";
      setMessage(`The projector jammed${detail}. Try again in a minute.`);
    } else {
      const data = await res.json().catch(() => null);
      const dealt = data?.dealt ?? 0;
      if (dealt === 0) {
        setMessage(
          "The engine came back empty — every candidate was already in your history or didn't check out. Widen the obscurity dial, uncheck 'my services only', or add more loved films and try again (this attempt didn't count against your daily limit).",
        );
      } else {
        const v = vibeByKey(vibe);
        setMessage(
          `Dealt ${dealt} fresh film${dealt === 1 ? "" : "s"}${v ? ` for “${v.label}”` : ""}.`,
        );
      }
    }
    await load();
    setDealing(false);
  }

  async function setStatus(rec: RecRow, status: string) {
    if (status === "watchlisted") sfxPop();
    setRecs((prev) => prev.filter((r) => r.id !== rec.id));
    await fetch(`/api/recs/${rec.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function submitReaction(rec: RecRow, payload: ReactionPayload) {
    if (payload.reaction === "loved" || payload.reaction === "loved_ironically") {
      sfxChime();
      setConfetti((c) => c + 1);
    }
    await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        movieId: rec.movies?.id,
        recId: rec.id,
        ...payload,
      }),
    });
    setReacting(null);
    setRecs((prev) => prev.filter((r) => r.id !== rec.id));
  }

  function tapReason(rec: RecRow) {
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "reason_tapped", props: { recId: rec.id } }),
    });
  }

  const visible = useMemo(
    () =>
      recs.filter((r) => {
        if (r.obscurity < depth) return false;
        if (mineOnly) {
          const avail = availableServices(r);
          if (!avail.some((s) => myServices.includes(s))) return false;
        }
        return true;
      }),
    [recs, depth, mineOnly, myServices],
  );

  return (
    <section className="flex flex-col gap-4">
      <Confetti trigger={confetti} />
      <header>
        <MarqueeBulbs />
        <p className="eyebrow mt-2">Tonight</p>
        <h1 className="neon-flicker font-display text-5xl leading-[0.95] text-amber">
          MOVIES YOU HAVEN&apos;T MET YET
        </h1>
      </header>

      <div className="flex flex-col gap-3 rounded border border-line bg-surface p-3">
        <div>
          <p className="eyebrow mb-1.5">Tonight I want…</p>
          <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none]">
            {VIBES.map((v) => {
              const on = vibe === v.key;
              return (
                <button
                  key={v.key}
                  onClick={() => {
                    sfxPop();
                    setVibe(on ? null : v.key);
                  }}
                  aria-pressed={on}
                  className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider transition-colors ${
                    on
                      ? "border-ticket bg-ticket/20 text-cream glow-ticket"
                      : "border-line bg-surface text-dim"
                  }`}
                >
                  {v.emoji} {v.label}
                </button>
              );
            })}
          </div>
          {vibe && (
            <p className="mt-1 font-mono text-[0.6rem] text-ticket">
              Next deal is all “{vibeByKey(vibe)?.label}” — tap the chip again to clear.
            </p>
          )}
        </div>
        <label className="flex items-center gap-3">
          <span className="eyebrow shrink-0">Obscurity</span>
          <input
            type="range"
            min={1}
            max={5}
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            className="w-full accent-amber"
            aria-label="Minimum obscurity"
          />
          <span className="font-mono text-xs tracking-widest text-amber">
            {"◆".repeat(depth)}
            {"◇".repeat(5 - depth)}
          </span>
        </label>
        <label className="flex items-center gap-2 font-mono text-xs text-dim">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(e) => setMineOnly(e.target.checked)}
            className="accent-avail"
          />
          my services only
        </label>
        <button
          onClick={deal}
          disabled={dealing}
          className="pulse-cta rounded bg-ticket px-4 py-3.5 font-mono text-sm font-medium uppercase tracking-[0.2em] text-cream disabled:animate-none disabled:opacity-50"
        >
          {dealing
            ? "Dealing…"
            : vibe
              ? `★ Deal me “${vibeByKey(vibe)?.label}” ★`
              : "★ Deal me more ★"}
        </button>
      </div>

      {message && <p className="font-mono text-xs text-ticket">{message}</p>}

      {loading ? (
        <FilmLeader label="rolling film" />
      ) : visible.length === 0 ? (
        <div className="ticket-edge rounded p-6 text-center">
          <p className="font-display text-2xl text-cream">NOTHING ON THE MARQUEE</p>
          {recs.length > 0 ? (
            <>
              <p className="mt-1 text-sm text-dim">
                {recs.length} rec{recs.length === 1 ? "" : "s"} hidden by your filters.
              </p>
              <button
                onClick={() => {
                  setDepth(1);
                  setMineOnly(false);
                }}
                className="mt-3 rounded border border-amber px-3 py-2 font-mono text-xs uppercase tracking-widest text-amber"
              >
                Show everything
              </button>
            </>
          ) : (
            <p className="mt-1 text-sm text-dim">Deal a fresh batch above.</p>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {visible.map((rec, idx) => {
            const m = rec.movies;
            if (!m) return null;
            const avail = availableServices(rec);
            return (
              <React.Fragment key={rec.id}>
              {idx === 3 && (
                <li>
                  <AdSlot index={0} slot="tonight-feed" />
                </li>
              )}
              <li
                className="film-card deal-in flex gap-3 rounded-lg p-3"
                style={{ "--i": idx } as React.CSSProperties}
              >
                <Link href={`/m/${m.id}`} className="wiggle relative w-24 shrink-0">
                  <Poster
                    posterPath={m.poster_path}
                    title={m.title}
                    year={m.year}
                    genres={m.genres}
                  />
                  {rec.obscurity === 5 && (
                    <span className="stamp stamp-gold absolute -left-2 top-2">Rare find</span>
                  )}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link href={`/m/${m.id}`} className="truncate font-display text-xl text-cream">
                      {m.title}
                    </Link>
                    <ObscurityDots score={rec.obscurity} />
                  </div>
                  <p className="font-mono text-[0.65rem] text-dim">
                    {m.year ?? "—"}
                    {m.runtime ? ` · ${m.runtime} min` : ""}
                  </p>
                  <RatingsBadges
                    className="mt-1"
                    ratings={{ tmdb: m.tmdb_rating, imdb: m.imdb_rating, rt: m.rt_rating }}
                  />
                  <button
                    onClick={() => tapReason(rec)}
                    className="mt-1.5 text-left text-sm italic text-amber"
                  >
                    {rec.reason}
                  </button>
                  {m.overview && (
                    <p className="mt-1 line-clamp-2 text-xs text-dim">{m.overview}</p>
                  )}
                  <div className="mt-1.5">
                    <ServiceBadges available={avail} mine={myServices} />
                  </div>
                  <div className="mt-auto flex gap-2 pt-2">
                    <button
                      onClick={() => setStatus(rec, "watchlisted")}
                      className="rounded border border-amber px-2.5 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-amber"
                    >
                      + Watchlist
                    </button>
                    <button
                      onClick={() => setReacting(rec)}
                      className="rounded border border-line px-2.5 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-cream"
                    >
                      Seen it
                    </button>
                    <button
                      onClick={() => setStatus(rec, "dismissed")}
                      className="rounded border border-line px-2.5 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-dim"
                    >
                      Not for me
                    </button>
                  </div>
                </div>
              </li>
              </React.Fragment>
            );
          })}
        </ul>
      )}

      {visible.length > 0 && recs.length > visible.length && (
        <p className="text-center font-mono text-[0.65rem] text-dim">
          {recs.length - visible.length} more hidden by your filters
        </p>
      )}

      {reacting && reacting.movies && (
        <ReactionSheet
          title={reacting.movies.title}
          onClose={() => setReacting(null)}
          onSubmit={(payload) => submitReaction(reacting, payload)}
        />
      )}
    </section>
  );
}
