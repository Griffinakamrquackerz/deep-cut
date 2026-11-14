"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

// The intermission snipe.
//
// Between features, a drive-in ran a reel with a clock on it — ten minutes to
// showtime, nine, eight — and a suggestion about the concession stand. This is
// that card, and the clock runs: it counts down from ten minutes for as long
// as you leave it on screen, then starts again, because the show never does
// actually start. It's an intermission.

const START = 10 * 60;

export default function Snipe({
  title,
  line,
  href,
  cta,
  kicker = "Intermission",
  className = "",
}: {
  title: string;
  line: string;
  href: string;
  cta: string;
  kicker?: string;
  className?: string;
}) {
  const [left, setLeft] = useState(START);
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => (s <= 1 ? START : s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");

  return (
    <div className={`snipe ${className}`}>
      <div
        className="snipe-clock"
        aria-hidden
        style={{ "--left": `${(left / START) * 100}%` } as React.CSSProperties}
      >
        <b>
          {mm}:{ss}
          <small>to showtime</small>
        </b>
      </div>
      <div className="min-w-0">
        <p className="snipe-kicker">{kicker}</p>
        <p className="snipe-title">{title}</p>
        <p className="snipe-line">{line}</p>
        <Link href={href} className="snipe-cta">
          {cta} →
        </Link>
      </div>
    </div>
  );
}
