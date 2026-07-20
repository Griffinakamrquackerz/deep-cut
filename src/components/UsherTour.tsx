"use client";
import { useCallback, useEffect, useState } from "react";
import { sfxPop } from "@/lib/sfx";

// The Usher — a one-time, always-skippable flashlight walk to your seat.
// Five beats, ~20 seconds, fires once (localStorage) on the Tonight screen.
// Spotlights are found by [data-usher] attributes; a missing target just
// skips its beat, so layout changes can never strand the tour.

const KEY = "dc_usher_done";

interface Beat {
  sel: string;
  eyebrow: string;
  line: string;
}

const BEATS: Beat[] = [
  {
    sel: '[data-usher="deal"]',
    eyebrow: "The dealer",
    line: "This is the dealer. It already knows your taste — and it sharpens with every film you rate.",
  },
  {
    sel: '[data-usher="dial"]',
    eyebrow: "The dial",
    line: "How deep you want to go. ◆◆ skips what everyone's seen; ◆◆◆◆◆ is the vault.",
  },
  {
    sel: '[data-usher="doors"]',
    eyebrow: "The other doors",
    line: "Two more ways in: settle a movie-night argument, or tune into a channel and lean back.",
  },
  {
    sel: '[data-usher="youtab"]',
    eyebrow: "Your card",
    line: "Your card lives here — the films you love, your crew rank, your streak.",
  },
  {
    sel: '[data-usher="settingstab"]',
    eyebrow: "Style it",
    line: "Dress your profile in Settings — pick a theme, your signature film, your face on the marquee.",
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

  // Fire once, shortly after mount so the marquee has painted.
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY)) return;
    } catch {
      return;
    }
    const t = setTimeout(() => setBeat(0), 900);
    return () => clearTimeout(t);
  }, []);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* private mode — the tour just repeats next visit */
    }
    setBeat(-1);
  }, []);

  // Measure the current beat's target; skip beats whose target is missing.
  useEffect(() => {
    if (beat < 0) return;
    if (beat >= BEATS.length) {
      finish();
      return;
    }
    const el = document.querySelector(BEATS[beat].sel);
    if (!el) {
      setBeat((b) => b + 1);
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - 8, left: r.left - 8, width: r.width + 16, height: r.height + 16 });
  }, [beat, finish]);

  if (beat < 0 || beat >= BEATS.length || !rect) return null;
  const b = BEATS[beat];
  const last = beat === BEATS.length - 1;
  // Caption above or below the spotlight, whichever has room.
  const below = rect.top + rect.height + 150 < window.innerHeight;

  return (
    <div
      className="fixed inset-0 z-[70]"
      role="dialog"
      aria-label="Quick tour"
      onClick={() => {
        sfxPop();
        setBeat((x) => x + 1);
      }}
    >
      {/* The flashlight: a cutout ringed in amber, everything else house-dark */}
      <div
        className="absolute rounded-lg border-2 border-amber transition-all duration-300"
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          boxShadow: "0 0 0 9999px rgba(13, 9, 7, 0.85), 0 0 24px 4px rgba(255, 180, 84, 0.35)",
        }}
      />
      <div
        className="absolute left-1/2 w-[88%] max-w-sm -translate-x-1/2"
        style={below ? { top: rect.top + rect.height + 14 } : { bottom: window.innerHeight - rect.top + 14 }}
      >
        <div className="ticket-edge rounded bg-surface p-3.5 shadow-2xl">
          <p className="eyebrow text-amber">
            🔦 The usher · {beat + 1}/{BEATS.length} — {b.eyebrow}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-cream">{b.line}</p>
          <div className="mt-2.5 flex items-center justify-between">
            <button
              onClick={(e) => {
                e.stopPropagation();
                finish();
              }}
              className="font-mono text-[0.6rem] uppercase tracking-widest text-dim underline"
            >
              skip the tour
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                sfxPop();
                setBeat((x) => x + 1);
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
