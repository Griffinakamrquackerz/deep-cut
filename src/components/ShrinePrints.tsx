"use client";
import { useEffect, useRef, useState } from "react";

// The living shrine wall — six taped-up prints, and every few seconds the
// projectionist swaps one for another still from the same film. First swap
// lands ~3s in, then round-robin every ~2.5s. Crossfades are preloaded so a
// slot never goes dark; reduced-motion and hidden tabs freeze the wall.

interface Slot {
  left: string;
  top: string;
  width: string;
  rotate: number;
  z: number;
}

const SLOTS: Slot[] = [
  { left: "-5%", top: "12%", width: "40%", rotate: -8, z: 3 },
  { left: "24%", top: "-10%", width: "44%", rotate: 5, z: 2 },
  { left: "52%", top: "6%", width: "42%", rotate: -5, z: 4 },
  { left: "76%", top: "40%", width: "38%", rotate: 8, z: 2 },
  { left: "6%", top: "52%", width: "38%", rotate: 6, z: 5 },
  { left: "40%", top: "46%", width: "44%", rotate: -7, z: 6 },
];

/** Small deterministic jitter so two shrines never look identical. */
function jitter(seed: number, i: number, range: number): number {
  const h = (seed * 2654435761 + i * 40503) >>> 0;
  return (h % (range * 2 + 1)) - range;
}

const FIRST_SWAP_MS = 3000;
const SWAP_EVERY_MS = 2500;
const FADE_MS = 600;

interface SlotState {
  cur: string;
  prev: string | null;
}

export default function ShrinePrints({ movieId, stills }: { movieId: number; stills: string[] }) {
  const initial = stills.slice(0, SLOTS.length);
  const [slots, setSlots] = useState<SlotState[]>(initial.map((p) => ({ cur: p, prev: null })));
  const poolCursor = useRef(initial.length); // next unused still
  const slotCursor = useRef(0); // which slot swaps next
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    // Nothing to rotate through, or the user asked for stillness.
    if (
      stills.length <= SLOTS.length ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (!alive.current) return;
      if (document.hidden) {
        timer = setTimeout(tick, SWAP_EVERY_MS);
        return;
      }
      const si = slotCursor.current % SLOTS.length;
      slotCursor.current++;
      const next = stills[poolCursor.current % stills.length];
      poolCursor.current++;
      // Preload the incoming print, then crossfade it over the old one.
      const img = new Image();
      img.onload = () => {
        if (!alive.current) return;
        setSlots((prev) =>
          prev.map((s, i) => (i === si && s.cur !== next ? { cur: next, prev: s.cur } : s)),
        );
        setTimeout(() => {
          if (!alive.current) return;
          setSlots((prev) => prev.map((s, i) => (i === si ? { ...s, prev: null } : s)));
        }, FADE_MS + 60);
      };
      img.src = `https://image.tmdb.org/t/p/w780${next}`;
      timer = setTimeout(tick, SWAP_EVERY_MS);
    };
    timer = setTimeout(tick, FIRST_SWAP_MS);
    return () => {
      alive.current = false;
      clearTimeout(timer);
    };
  }, [stills]);

  return (
    <>
      {slots.map((s, i) => {
        const slot = SLOTS[i];
        if (!slot) return null;
        return (
          <div
            key={i}
            className="shrine-photo absolute"
            style={{
              left: slot.left,
              top: slot.top,
              width: slot.width,
              zIndex: slot.z,
              transform: `rotate(${slot.rotate + jitter(movieId, i, 3)}deg)`,
            }}
          >
            <span className="shrine-tape" aria-hidden />
            <div className="relative aspect-video w-full overflow-hidden">
              {s.prev && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={`https://image.tmdb.org/t/p/w780${s.prev}`}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={s.cur}
                src={`https://image.tmdb.org/t/p/w780${s.cur}`}
                alt=""
                loading={i < 3 ? "eager" : "lazy"}
                decoding="async"
                className={`relative h-full w-full object-cover ${s.prev ? "print-in" : ""}`}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}
