"use client";
import { useEffect, useState } from "react";

// Fires a burst of ticket stubs whenever `trigger` changes. The stubs are
// drawn (see .confetti-bit) in the house's own three colours, so a member's
// profile theme re-tints the celebration along with everything else.
const BITS = ["amber", "ticket", "cream", "amber", "avail"];

export default function Confetti({ trigger }: { trigger: number }) {
  const [burst, setBurst] = useState<number | null>(null);

  useEffect(() => {
    if (trigger <= 0) return;
    setBurst(trigger);
    const t = setTimeout(() => setBurst(null), 1700);
    return () => clearTimeout(t);
  }, [trigger]);

  if (burst == null) return null;

  return (
    <div className="confetti-layer" aria-hidden>
      {Array.from({ length: 28 }, (_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.25;
        const dur = 1.2 + Math.random() * 0.7;
        const bit = BITS[i % BITS.length];
        return (
          <span
            key={`${burst}-${i}`}
            className={`confetti-bit confetti-bit--${bit}`}
            style={{
              left: `${left}%`,
              animationDelay: `${delay}s`,
              animationDuration: `${dur}s`,
              rotate: `${(i * 47) % 360}deg`,
            }}
          />
        );
      })}
    </div>
  );
}
