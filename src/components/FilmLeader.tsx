"use client";
import { useEffect, useState } from "react";

// SMPTE-style academy countdown leader — the sweeping-hand "3·2·1" you see
// before an old print starts. Used as the app's loading state.
export default function FilmLeader({ label = "rolling film" }: { label?: string }) {
  const [n, setN] = useState(3);
  useEffect(() => {
    const t = setInterval(() => setN((v) => (v <= 1 ? 3 : v - 1)), 900);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-14" role="status" aria-label={label}>
      <div className="relative h-28 w-28">
        {/* crosshair */}
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-line" />
        <div className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-line" />
        {/* rings */}
        <div className="absolute inset-0 rounded-full border border-line" />
        <div className="absolute inset-3 rounded-full border border-line/70" />
        {/* sweeping hand */}
        <div
          className="absolute left-1/2 top-1/2 h-1/2 w-px origin-top -translate-x-1/2 bg-amber/80"
          style={{ animation: "leader-sweep 0.9s linear infinite" }}
        />
        {/* number */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="glow-amber font-display text-6xl leading-none text-amber">{n}</span>
        </div>
      </div>
      <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-dim">{label}…</p>
      <style jsx>{`
        @keyframes leader-sweep {
          from {
            transform: translateX(-50%) rotate(0deg);
          }
          to {
            transform: translateX(-50%) rotate(360deg);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          div[style] {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
