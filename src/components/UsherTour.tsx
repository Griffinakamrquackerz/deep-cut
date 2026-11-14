"use client";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { sfxPop } from "@/lib/sfx";

// The studio tour — a walk through the whole house, mounted in the tabs layout
// so it survives navigating between rooms.
//
// Two kinds of beat:
//   · Spotlight — a flashlight cutout over a real control on Tonight.
//   · Room — walks you into a tab and talks over the actual screen.
//
// Pointing a ring at a tab icon names the door; opening it shows the room. The
// tab beats now navigate, which is also why this can't live inside Tonight.
//
// Shown on every visit until someone opts out. RUNS_KEY counts completed runs
// and the opt-out only appears from the second, so nobody dismisses the tour
// before seeing it and nobody is stuck with it after. A run only counts if a
// beat actually rendered — an earlier version wrote its "seen" flag even when
// every target was missing, which burned the tour without ever showing it.
const RUNS_KEY = "dc_studio_tour_runs";
const OPTOUT_KEY = "dc_studio_tour_optout";

// Client-side navigation remounts layouts. Without this the tour would restart
// every time someone came back to the front room.
let firedThisSession = false;

interface Beat {
  /** Where this beat is shown. The tour navigates there before speaking. */
  route: string;
  /** A [data-usher] selector to spotlight. Absent = talk over the whole room. */
  sel?: string;
  eyebrow: string;
  line: string;
}

// The eyebrow names the thing; the line must never restate it. One beat, one
// idea — except You and Settings, which carry the customization story.
const BEATS: Beat[] = [
  {
    route: "/",
    sel: '[data-usher="deal"]',
    eyebrow: "The dealer",
    line: "Three films, on the house. Watchlist it, seen it, or wave it off. Your PA is taking notes either way.",
  },
  {
    route: "/",
    sel: '[data-usher="dial"]',
    eyebrow: "The dial",
    line: "◆◆ is stuff people have heard of. ◆◆◆◆◆ is the back of the vault. Pick a mood, show only what's on your streaming platforms, then turn it as far as you dare.",
  },
  {
    route: "/",
    sel: '[data-usher="settle"]',
    eyebrow: "Can't agree?",
    line: "Two of you, one screen, five questions each. Nobody has to say “I don't care, you pick.” The house decides, and you both get to blame the house.",
  },
  {
    route: "/",
    sel: '[data-usher="roll"]',
    eyebrow: "Tired brain?",
    line: "Pick a channel and lie back. Trailers play one after another until something sticks.",
  },
  {
    route: "/",
    sel: '[data-usher="blend"]',
    eyebrow: "This meets that",
    line: "Name two or three films and watch their love child turn up.",
  },
  {
    route: "/",
    sel: '[data-usher="tv"]',
    eyebrow: "Deep Cut Theatre",
    line: "Award-winning indie films you've never seen, on a television in a basement. Pick a channel, a tape goes in, you watch. New bill every month.",
  },
  {
    route: "/playlists",
    eyebrow: "Mixtapes",
    line: "Burn a tape out of the films you love and send it to someone. They send one back. That's the whole ritual.",
  },
  {
    route: "/lobby",
    eyebrow: "The lobby",
    line: "See what everyone else is watching. Read the hot takes, follow the people who keep turning up the good stuff.",
  },
  {
    route: "/you",
    eyebrow: "Your card",
    line: "This is what strangers see when they look you up. Loved films, the threads running through them, and a crew credit that climbs every time you rate something.",
  },
  {
    route: "/settings",
    eyebrow: "The booth",
    line: "Where you dress that card. Headshot, house colours, a signature film over the door. Tell it what you subscribe to while you're here, so it stops teasing you with films you can't watch.",
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export default function UsherTour() {
  const [beat, setBeat] = useState(-1); // -1 = not running
  const [rect, setRect] = useState<Rect | null>(null);
  const [runs, setRuns] = useState(0);
  const shownAny = useRef(false);
  const router = useRouter();
  const pathname = usePathname();

  // Fire once per visit, shortly after mount so the marquee has painted.
  useEffect(() => {
    if (firedThisSession) return;
    try {
      if (localStorage.getItem(OPTOUT_KEY)) return;
      setRuns(Number(localStorage.getItem(RUNS_KEY)) || 0);
    } catch {
      return; // storage blocked — don't ambush someone on every page view
    }
    firedThisSession = true;
    const t = setTimeout(() => setBeat(0), 900);
    return () => clearTimeout(t);
  }, []);

  const finish = useCallback(() => {
    try {
      // Only count a run someone actually saw. A tour where every target failed
      // to resolve has taught nobody anything and must not spend a run.
      if (shownAny.current) localStorage.setItem(RUNS_KEY, String(runs + 1));
    } catch {
      /* private mode — the tour just repeats next visit */
    }
    setBeat(-1);
    setRect(null);
    router.push("/"); // the tour ends where it started
  }, [runs, router]);

  const optOut = useCallback(() => {
    try {
      localStorage.setItem(OPTOUT_KEY, "1");
    } catch {
      /* private mode — nothing to remember it with */
    }
    finish();
  }, [finish]);

  // Walk to the room this beat is about, then find its target (if it has one).
  useEffect(() => {
    if (beat < 0) return;
    if (beat >= BEATS.length) {
      finish();
      return;
    }
    const b = BEATS[beat];

    if (pathname !== b.route) {
      router.push(b.route);
      return; // the pathname change re-runs this effect, now in the right room
    }

    if (!b.sel) {
      shownAny.current = true;
      setRect(null); // room beat — the screen behind IS the illustration
      return;
    }

    const sel = b.sel;
    let cancelled = false;
    // Wait for the target instead of skipping it the instant it's missing.
    // Tonight's controls render after its first fetch resolves, so a single
    // lookup 900ms in could miss every one of them.
    let tries = 0;
    const attempt = () => {
      if (cancelled) return;
      const el = document.querySelector(sel);
      if (!el) {
        if (++tries >= 15) setBeat((x) => x + 1);
        else setTimeout(attempt, 200);
        return;
      }
      el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
      const r = el.getBoundingClientRect();
      shownAny.current = true;
      setRect({ top: r.top - 8, left: r.left - 8, width: r.width + 16, height: r.height + 16 });
    };
    attempt();

    return () => {
      cancelled = true;
    };
  }, [beat, pathname, router, finish]);

  if (beat < 0 || beat >= BEATS.length) return null;
  const b = BEATS[beat];
  if (b.sel && !rect) return null; // still hunting for it
  const spotlit = !!b.sel && !!rect;

  const last = beat === BEATS.length - 1;
  const advance = () => {
    sfxPop();
    setRect(null); // never show the old cutout against the next beat's room
    setBeat((x) => x + 1);
  };

  // Spotlight beats caption next to the lit control; room beats sit near the
  // bottom, clear of the room they're describing.
  const below = spotlit && rect!.top + rect!.height + 170 < window.innerHeight;
  const captionStyle = !spotlit
    ? { bottom: "7rem" }
    : below
      ? { top: rect!.top + rect!.height + 14 }
      : { bottom: window.innerHeight - rect!.top + 14 };

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-label="Studio tour" onClick={advance}>
      {spotlit ? (
        // The flashlight: a cutout ringed in amber, everything else house-dark
        <div
          className="absolute rounded-lg border-2 border-amber transition-all duration-300"
          style={{
            top: rect!.top,
            left: rect!.left,
            width: rect!.width,
            height: rect!.height,
            boxShadow: "0 0 0 9999px rgba(13, 9, 7, 0.85), 0 0 24px 4px rgba(255, 180, 84, 0.35)",
          }}
        />
      ) : (
        // Lighter than the flashlight on purpose: the room behind is the point.
        <div className="absolute inset-0 bg-bg/45" />
      )}
      <div className="absolute left-1/2 w-[88%] max-w-sm -translate-x-1/2" style={captionStyle}>
        <div className="ticket-edge rounded bg-surface p-3.5 shadow-2xl">
          <p className="eyebrow text-amber">
            🎬 The studio tour · {beat + 1}/{BEATS.length} — {b.eyebrow}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-cream">{b.line}</p>
          {/* No skip. Clicking the dim still advances, so the tour can always be
              walked through — it just can't be dismissed unread. Back is the
              other half: without it a stray click loses a beat for good. */}
          <div className="mt-2.5 flex items-center justify-between">
            {beat > 0 ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  sfxPop();
                  setRect(null);
                  setBeat((x) => x - 1);
                }}
                className="font-mono text-[0.6rem] uppercase tracking-widest text-dim underline"
              >
                ← Back
              </button>
            ) : runs > 0 ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  optOut();
                }}
                className="font-mono text-[0.6rem] uppercase tracking-widest text-dim underline"
              >
                Don&apos;t show again
              </button>
            ) : (
              <span />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                advance();
              }}
              className="rounded bg-amber px-3.5 py-1.5 font-mono text-[0.65rem] font-medium uppercase tracking-widest text-bg"
            >
              {last ? "That's my seat ★" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
