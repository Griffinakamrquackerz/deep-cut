"use client";
import NowShowing from "@/components/NowShowing";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Poster from "./Poster";
import ObscurityDots from "./ObscurityDots";
import ServiceBadges from "./ServiceBadges";
import RatingsBadges from "./RatingsBadges";
import ReactionSheet, { type ReactionPayload } from "./ReactionSheet";
import FilmLeader from "./FilmLeader";
import MarqueeBulbs from "./MarqueeBulbs";
import DealReels from "./DealReels";
import HouseDark from "./HouseDark";
import AdSlot from "./AdSlot";
import HouseCall from "./HouseCall";
import FundBar from "./FundBar";
import Confetti from "./Confetti";
import { sfxChime, sfxClick, sfxPop, haptic } from "@/lib/sfx";
import { toast } from "@/lib/toast";
import { SERVICES, type Service } from "@/lib/services";
import { VIBES, vibeByKey } from "@/lib/vibes";
import { gemLabel } from "@/lib/gem";
import { byRecommendationPreference } from "@/lib/recommendation-quality";

interface RecRow {
  id: string;
  reason: string;
  obscurity: number;
  /** Acclaim-vs-reach, 1-5; null when we have no rating to judge on. */
  gem?: number | null;
  batch: number;
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

export default function TonightScreen({
  myServices,
  premium = false,
}: {
  myServices: Service[];
  premium?: boolean;
}) {
  const [recs, setRecs] = useState<RecRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dealing, setDealing] = useState(false);
  const [depth, setDepth] = useState(3); // less-seen films; the quality gate still applies
  const [mineOnly, setMineOnly] = useState(false);
  const [vibe, setVibe] = useState<string | null>(null);
  const [tuning, setTuning] = useState(false);
  const [reacting, setReacting] = useState<RecRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // An empty deal used to end in a paragraph telling you which three controls
  // to go and change. The controls are the fix, so offer the fix.
  const [widenable, setWidenable] = useState(false);
  const [confetti, setConfetti] = useState(0);

  const load = useCallback(async () => {
    let res: Response;
    try {
      res = await fetch("/api/recs");
    } catch {
      setLoading(false);
      setMessage("Couldn't reach the house — check your connection and try again.");
      return;
    }
    if (res.ok) {
      const data = await res.json().catch(() => null);
      setRecs((data?.recs ?? []).filter((r: RecRow) => r.status === "active"));
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

  /**
   * Deal a batch.
   *
   * Takes the settings explicitly rather than reading state, because the
   * "open it up" retry changes two of them and then deals immediately —
   * and React would still be holding the old values at that point.
   */
  async function deal(override?: { depth?: number; mineOnly?: boolean }) {
    const useDepth = override?.depth ?? depth;
    const useMine = override?.mineOnly ?? mineOnly;
    sfxClick();
    haptic(12);
    setDealing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/recs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          obscurityMin: useDepth,
          obscurityMax: 5,
          myServicesOnly: useMine,
          vibe,
        }),
      });
      if (res.status === 429) {
        const data = await res.json().catch(() => null);
        setMessage(
          data?.premium === false
            ? "That's your 10 free deals today. 🥂 Balcony Seats gets 30 a day and zero ads — 3 months free in Settings."
            : "You've hit today's deal limit — back tomorrow.",
        );
      } else if (!res.ok) {
        const data = await res.json().catch(() => null);
        const detail = data?.error ? `: ${String(data.error).slice(0, 200)}` : "";
        setMessage(`The projector jammed${detail}. Try again in a minute.`);
      } else {
        const data = await res.json().catch(() => null);
        const dealt = data?.dealt ?? 0;
        if (dealt === 0) {
          // Say which of your own settings squeezed it to nothing, rather than
          // listing every dial. Stacking the mood, the deep end of the obscurity
          // dial and your own streaming services is a narrow slice of a big
          // catalogue, and the intersection can genuinely be empty.
          const tight = [
            vibe ? "that mood" : null,
            useMine ? "your services only" : null,
          ].filter(Boolean);
          setMessage(
            tight.length
              ? `No qualifying films matched ${tight.join(" + ")} on this pass. This attempt didn't count against your daily limit.`
              : "The house came up empty on this pass. Untouched picks can return; try again in a moment (this attempt didn't count against your daily limit).",
          );
          setWidenable(useMine);
        } else {
          setWidenable(false);
          const v = vibeByKey(vibe);
          haptic([30, 40, 30]);
          toast(`Dealt ${dealt} fresh film${dealt === 1 ? "" : "s"}${v ? ` · ${v.label}` : ""}`, {
            tone: "ticket",
            icon: "🎟",
          });
        }
      }
    } catch {
      // A network failure on the deal request must not leave the button stuck.
      setMessage("Couldn't reach the house — check your connection and try again.");
    }
    try {
      await load();
    } catch {
      // load() already set its own error message and loading=false; don't
      // let a load failure leave the deal button stuck.
    }
    setDealing(false);
  }

  // Cold-start magic moment: a brand-new user who lands with zero recs gets
  // their first batch dealt automatically instead of staring at "the house is
  // dark". Fires once ever (localStorage), only on a clean empty state — so it
  // never hijacks a returning user's daily deal budget.
  const autoDealtRef = useRef(false);
  useEffect(() => {
    if (autoDealtRef.current || loading || dealing || recs.length > 0 || message) return;
    try {
      if (localStorage.getItem("dc_autodealt")) return;
      localStorage.setItem("dc_autodealt", "1");
    } catch {
      /* private mode — just skip the one-time auto-deal */
      return;
    }
    autoDealtRef.current = true;
    void deal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, recs.length, dealing, message]);

  async function setStatus(rec: RecRow, status: string) {
    if (status === "watchlisted") {
      sfxPop();
      haptic(20);
      toast(`Saved to your watchlist`, { tone: "amber", icon: "＋" });
    }
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
      haptic([20, 30, 20]);
      setConfetti((c) => c + 1);
      toast("Logged with love", { tone: "ticket", icon: "❤" });
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

  // One line standing in for the whole console. Platforms only appear when the
  // filter is actually on — "all platforms" every time is noise.
  const tuneSummary = useMemo(() => {
    const v = vibeByKey(vibe);
    return [
      v ? `${v.emoji} ${v.label}` : "🎭 Any vibe",
      "◆".repeat(depth) + "◇".repeat(5 - depth),
      mineOnly ? "my platforms" : null,
    ]
      .filter(Boolean)
      .join("  ·  ");
  }, [vibe, depth, mineOnly]);

  const visible = useMemo(
    () =>
      byRecommendationPreference(
        recs.filter((r) => {
          if (mineOnly) {
            const avail = availableServices(r);
            if (!avail.some((s) => myServices.includes(s))) return false;
          }
          return true;
        }),
        depth,
      ),
    [recs, depth, mineOnly, myServices],
  );

  return (
    <section className="flex flex-col gap-4">
      <Confetti trigger={confetti} />
      <header className="program-header">
        <MarqueeBulbs />
        <p className="eyebrow mt-2">Tonight</p>
        <h1 className="neon-flicker font-display text-5xl leading-[0.95] text-amber">
          MOVIES YOU HAVEN&apos;T SEEN YET
        </h1>
      </header>

      {/* Now Showing — the basement television, cropped out of its own
          photograph, in the slot the morning-after card used to hold. It flips
          channels on its own; clicking it opens the room. */}
      <NowShowing />

      {/* The games, demoted to a row of chips.
          They used to be three full-width doors of equal weight, all camp, all
          shouting — which is what made the front room feel busy, not the fact
          that the features exist. Now Showing is the hero, the dealer and the
          dial are the loop, and these three are a utility rail: same features,
          a third of the noise, and the page finally has a top.
          The kicker lines go with the doors. "Can't agree?" was doing the
          explaining, and that job belongs to the studio tour and to the screens
          themselves, not to the front room on every single visit. */}
      <div data-usher="doors" className="grid grid-cols-3 gap-2">
        <Link
          href="/settle"
          data-usher="settle"
          onClick={() => sfxClick()}
          className="flex min-h-[46px] items-center justify-center rounded-lg border border-line bg-surface px-1.5 py-2 text-center font-mono text-[0.6rem] leading-snug tracking-wide text-cream"
        >
          ⚖️&nbsp;&nbsp;SETTLE IT
        </Link>
        <Link
          href="/roll"
          data-usher="roll"
          onClick={() => sfxClick()}
          className="flex min-h-[46px] items-center justify-center rounded-lg border border-line bg-surface px-1.5 py-2 text-center font-mono text-[0.6rem] leading-snug tracking-wide text-cream"
        >
          📺&nbsp;&nbsp;JUST ROLL IT
        </Link>
        {/* The staff pick. Video stores hand-wrote these on index cards and
            taped them to the shelf, which is exactly the register this app is
            in — and a recommendation with a name attached carries weight that
            "FEATURED" never does. */}
        <Link
          href="/blend"
          data-usher="blend"
          onClick={() => sfxClick()}
          className="flex min-h-[46px] flex-col items-center justify-center rounded-lg border border-amber bg-surface px-1.5 py-2 text-center font-mono text-[0.6rem] leading-snug tracking-wide text-amber"
        >
          <span className="mb-0.5 text-[0.45rem] font-medium tracking-widest">
            ★ GRIFF&apos;S FAVORITE
          </span>
          🧬&nbsp;&nbsp;THIS MEETS THAT
        </Link>
      </div>

      {/* Tonight I want… — one line by default.
          Expanded, this console pushed every dealt film below the fold: you
          scrolled past the marquee, Now Showing, the games rail AND
          five rows of controls before meeting a single movie. The controls
          outranked the product. The dial is one click away; the deal button
          never moves. */}
      <div className="flex flex-col gap-3 rounded border border-line bg-surface p-3">
        <button
          data-usher="dial"
          onClick={() => {
            sfxPop();
            setTuning((t) => !t);
          }}
          aria-expanded={tuning}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="truncate font-mono text-xs tracking-wide text-cream">{tuneSummary}</span>
          <span className="shrink-0 text-amber">{tuning ? "▴" : "▾"}</span>
        </button>

        {tuning && (
        <>
        <div>
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
          <span className="eyebrow shrink-0">Obscurity goal</span>
          <input
            type="range"
            min={3}
            max={5}
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            className="w-full accent-amber"
            aria-label="Obscurity preference: niche to deep cut"
          />
          <span className="text-right font-mono text-[0.6rem] uppercase tracking-wider text-amber">
            {depth === 3 ? "Niche" : depth === 4 ? "Obscure" : "Deep cut"}
            <br />
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
        </>
        )}
        <button
          onClick={() => void deal()}
          disabled={dealing}
          data-usher="deal"
          className="pulse-cta rounded bg-ticket px-4 py-3.5 font-mono text-sm font-medium uppercase tracking-[0.2em] text-cream disabled:animate-none disabled:opacity-50"
        >
          {dealing ? (
            <DealReels />
          ) : vibe ? (
            `★ Deal me “${vibeByKey(vibe)?.label}” ★`
          ) : (
            "★ Deal me more ★"
          )}
        </button>
      </div>

      {message && <p className="font-mono text-xs text-ticket">{message}</p>}
      {widenable && (
        <button
          onClick={() => {
              // Services are a filter; obscurity is a ranking preference.
            setMineOnly(false);
            setWidenable(false);
            setMessage(null);
            void deal({ depth, mineOnly: false });
          }}
          disabled={dealing}
          className="self-start rounded border border-amber px-3 py-2 font-mono text-[0.65rem] uppercase tracking-widest text-amber disabled:opacity-50"
        >
          {dealing ? "…" : "↔ Open it up and try again"}
        </button>
      )}

      {/* Above the feed and outside the loading branch: the open call is worth
          seeing even on a night when no film gets dealt. */}
      <HouseCall />

      {loading ? (
        <FilmLeader label="rolling film" />
      ) : visible.length === 0 ? (
        <HouseDark
          title="THE HOUSE IS DARK"
          line={
            recs.length > 0
              ? `${recs.length} rec${recs.length === 1 ? "" : "s"} dimmed by your filters.`
              : "Deal a fresh batch above."
          }
        >
          {recs.length > 0 && (
            <button
              onClick={() => {
                setDepth(3);
                setMineOnly(false);
              }}
              className="rounded border border-amber px-3 py-2 font-mono text-xs uppercase tracking-widest text-amber"
            >
              Raise the lights
            </button>
          )}
        </HouseDark>
      ) : (
        <ul className="flex flex-col gap-4">
          {visible.map((rec, idx) => {
            const m = rec.movies;
            if (!m) return null;
            const avail = availableServices(rec);
            return (
              <React.Fragment key={rec.id}>
              {idx === 3 && !premium && (
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
                  {/* Earned on acclaim-vs-reach, not reach alone: a stamp
                      that only meant "few votes" was promising quality it had
                      never checked. */}
                  {gemLabel(rec.gem ?? null) && (
                    <span className="stamp stamp-gold absolute -left-2 top-2">
                      {gemLabel(rec.gem ?? null)}
                    </span>
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
                  {m.genres.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {m.genres.slice(0, 3).map((g) => (
                        <span
                          key={g}
                          className="rounded-sm border border-line px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-wider text-amber/80"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
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

      {/* The Fund, on the screen people actually open. Members earn votes by
          supporting and would otherwise never find out — there's no room in the
          tab bar, and Settings is where you go when something's wrong. */}
      <FundBar compact />

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
