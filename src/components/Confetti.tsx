"use client";
import { useEffect, useState } from "react";

// Fires a ticket-stub confetti burst whenever `trigger` changes.
const BITS = ["🎟️", "🍿", "★", "◆", "🎬"];

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
            className="confetti-bit"
            style={{
              left: `${left}%`,
              animationDelay: `${delay}s`,
              animationDuration: `${dur}s`,
            }}
          >
            {bit}
          </span>
        );
      })}
    </div>
  );
}
