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
import { FREE_DEALS_PER_WINDOW, FREE_DEAL_WINDOW_HOURS, PREMIUM_DEALS_PER_DAY } from "@/lib/deal-limits";
import RatingBand from "@/components/house/RatingBand";
import MarqueeBoard from "@/components/house/MarqueeBoard";
import { genreDot } from "@/lib/genre-dots";

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
        const reset = typeof data?.resetsAt === "string" ? new Date(data.resetsAt) : null;
        const resetText = reset && Number.isFinite(reset.getTime()) ? ` Your next window starts ${reset.toLocaleString()}.` : "";
        setMessage(data?.premium === false
          ? `That's your ${FREE_DEALS_PER_WINDOW} free deals for this ${FREE_DEAL_WINDOW_HOURS}-hour window.${resetText} 🥂 Balcony Seats gets ${PREMIUM_DEALS_PER_DAY} a day and zero ads — 30 days free in Settings.`
          : "You've hit today's deal limit — back tomorrow.");
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
              ? `No qualifying films matched ${tight.join(" + ")} on this pass. This attempt didn't count against your deal limit.`
              : "The house came up empty on this pass. Untouched picks can return; try again in a moment (this attempt didn't count against your deal limit).",
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
      v ? v.label : "Any vibe",
      depth === 3 ? "Niche" : depth === 4 ? "Obscure" : "Deep cut",
      mineOnly ? "My services" : null,
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
      {/* The marquee over the door: a lit letterboard with tonight's date
          on it. The front of the house, and the only screen that gets one. */}
      <MarqueeBoard title="Movies you haven't seen yet" red="haven't seen" />

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
          className="door-plate"
        >
          Settle It
        </Link>
        <Link
          href="/roll"
          data-usher="roll"
          onClick={() => sfxClick()}
          className="door-plate"
        >
          Just Roll It
        </Link>
        {/* The staff pick. Video stores hand-wrote these on index cards and
            taped them to the shelf, which is exactly the register this app is
            in — and a recommendation with a name attached carries weight that
            "FEATURED" never does. */}
        <Link
          href="/blend"
          data-usher="blend"
          onClick={() => sfxClick()}
          className="door-plate door-plate--pick"
        >
          <small>★ Griff&apos;s favorite</small>
          This Meets That
        </Link>
      </div>

      {/* Tonight I want… — one line by default.
          Expanded, this console pushed every dealt film below the fold: you
          scrolled past the marquee, Now Showing, the games rail AND
          five rows of controls before meeting a single movie. The controls
          outranked the product. The dial is one click away; the deal button
          never moves. */}
      {/* The box office. Same controls and the same one-line default as
          before; it's a booth now — brass plate, a pane of glass with a
          speaker grille, and a slot the tickets come out of. */}
      <div className="bo">
        <p className="bo-plate">Box office</p>
        <div className="bo-glass">
        <button
          data-usher="dial"
          onClick={() => {
            sfxPop();
            setTuning((t) => !t);
          }}
          aria-expanded={tuning}
          className="bo-row"
        >
          <span className="bo-grille" aria-hidden />
          <span className="bo-summary">
            <small>Tonight I want</small>
            {tuneSummary}
          </span>
          <span className={`bo-toggle ${tuning ? "is-open" : ""}`} aria-hidden />
        </button>

        {tuning && (
        <div className="bo-controls">
          {/* The mood. One at a time, and tapping the lit one clears it. */}
          <div>
            <p className="bo-label">Mood</p>
            <div className="bo-chips">
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
                    className="bo-chip"
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>
          </div>
          {/* The dial has three stops, so it is three keys rather than a
              slider you have to land on one of three points of. */}
          <div>
            <p className="bo-label">How far down the shelf</p>
            <div className="bo-depth" role="radiogroup" aria-label="Obscurity: niche to deep cut">
              {([3, 4, 5] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={depth === d}
                  onClick={() => {
                    sfxPop();
                    setDepth(d);
                  }}
                >
                  <b>{d === 3 ? "Niche" : d === 4 ? "Obscure" : "Deep cut"}</b>
                  <span aria-hidden>
                    {"◆".repeat(d)}
                    {"◇".repeat(5 - d)}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={mineOnly}
            onClick={() => {
              sfxPop();
              setMineOnly((m) => !m);
            }}
            className="bo-switch"
          >
            <span>Only what&apos;s on my services</span>
            <i aria-hidden />
          </button>
        </div>
        )}
        </div>
        <div className="bo-slot">
        <button
          onClick={() => void deal()}
          disabled={dealing}
          data-usher="deal"
          className="pulse-cta rounded bg-ticket px-4 py-3.5 font-mono text-sm font-medium uppercase tracking-[0.2em] text-cream disabled:animate-none disabled:opacity-50"
        >
          {dealing ? (
            <DealReels />
          ) : vibe ? (
            `Deal me “${vibeByKey(vibe)?.label}”`
          ) : (
            "Deal me more"
          )}
        </button>
        <p className="bo-slot-label" aria-hidden>
          Tickets
        </p>
        </div>
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
          {dealing ? "…" : "Open it up and try again"}
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
        <>
        {/* What's about to be shown, and to whom. */}
        <RatingBand
          compact
          what="deal"
          audience="your taste only"
          label="Dealt tonight"
          fine={`${visible.length} film${visible.length === 1 ? "" : "s"} off your shelf. ${
            depth === 3 ? "Niche and deeper" : depth === 4 ? "Obscure and deeper" : "Deep cuts only"
          }.`}
        />
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
              {/* A rental case on the shelf: the one-sheet in a clamshell,
                  genre on the coloured dots a video store sorts by, the
                  clerk's card underneath, and the lip of the shelf it's
                  standing on. */}
              <li className="rental deal-in" style={{ "--i": idx } as React.CSSProperties}>
                <div className="rental-row">
                <Link href={`/m/${m.id}`} className="vhs-case">
                  <Poster
                    posterPath={m.poster_path}
                    title={m.title}
                    year={m.year}
                    genres={m.genres}
                  />
                  {/* Earned on acclaim-vs-reach, not reach alone: a sticker
                      that only meant "few votes" was promising quality it had
                      never checked. */}
                  {gemLabel(rec.gem ?? null) && (
                    <span className="case-sticker">{gemLabel(rec.gem ?? null)}</span>
                  )}
                </Link>
                <div className="rental-facts">
                  <Link href={`/m/${m.id}`} className="rental-title">
                    {m.title}
                  </Link>
                  <p className="rental-meta">
                    {m.year ?? "—"}
                    {m.runtime ? ` · ${m.runtime} min` : ""}
                  </p>
                  <ObscurityDots score={rec.obscurity} />
                  {m.genres.length > 0 && (
                    <div className="genre-dots">
                      {m.genres.slice(0, 3).map((g) => (
                        <span
                          key={g}
                          className="genre-dot"
                          style={{ "--dot": genreDot(g) } as React.CSSProperties}
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                  <RatingsBadges
                    className="mt-1.5"
                    ratings={{ tmdb: m.tmdb_rating, imdb: m.imdb_rating, rt: m.rt_rating }}
                  />
                  <div className="mt-auto pt-2">
                    <ServiceBadges available={avail} mine={myServices} />
                  </div>
                </div>
                </div>
                {/* The reason, as the card a video-store clerk tapes under a
                    tape they need you to rent. It runs the width of the case:
                    it is the one sentence on here written for you, and it was
                    being set in a column four words wide. The synopsis is on
                    the film's own page, a tap on the case away. */}
                <button onClick={() => tapReason(rec)} className="shelf-talker">
                  <span className="shelf-talker-tag">Why it&apos;s yours</span>
                  <span className="shelf-talker-line">{rec.reason}</span>
                </button>
                {/* The three things you can do with it, stamped. */}
                <div className="stamp-row">
                  <button onClick={() => setStatus(rec, "watchlisted")} className="stamp-btn">
                    + Watchlist
                  </button>
                  <button onClick={() => setReacting(rec)} className="stamp-btn">
                    Seen it
                  </button>
                  <button onClick={() => setStatus(rec, "dismissed")} className="stamp-btn">
                    Not for me
                  </button>
                </div>
                <div className="rental-shelf" aria-hidden />
              </li>
              </React.Fragment>
            );
          })}
        </ul>
        </>
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
