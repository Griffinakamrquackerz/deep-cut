"use client";
import { useEffect } from "react";
import Link from "next/link";

// Ad slot in the Letterboxd style. Two modes:
// - NEXT_PUBLIC_ADSENSE_CLIENT set (ca-pub-…): renders a real AdSense unit.
// - Otherwise: a themed "house ad" promoting the app's own loops, so the
//   placement exists (and is measured) before the ad account is approved.
const CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

const HOUSE_ADS = [
  {
    eyebrow: "Intermission",
    title: "SEND SOMEONE A MIXTAPE",
    line: "Playlists are tickets — every one you share fills the lobby.",
    href: "/playlists",
    cta: "Make one",
  },
  {
    eyebrow: "Intermission",
    title: "YOUR TASTE, ON A TICKET",
    line: "Share your taste card and let friends read you like a marquee.",
    href: "/you",
    cta: "See yours",
  },
  {
    eyebrow: "Intermission",
    title: "GO DEEPER",
    line: "Crank the obscurity dial — the vault goes further than you think.",
    href: "/",
    cta: "Deal me more",
  },
];

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export default function AdSlot({
  slot,
  index = 0,
  className = "",
}: {
  /** AdSense ad-unit slot id (used only when the client id env is set). */
  slot?: string;
  /** Stable index so different placements rotate different house ads. */
  index?: number;
  className?: string;
}) {
  useEffect(() => {
    if (!CLIENT) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Ad blockers throw here — never let that break the page.
    }
  }, []);

  if (!CLIENT) {
    const ad = HOUSE_ADS[index % HOUSE_ADS.length];
    return (
      <div className={`film-card rounded-lg p-4 text-center ${className}`}>
        <p className="eyebrow">{ad.eyebrow}</p>
        <p className="glow-amber mt-1 font-display text-2xl text-amber">{ad.title}</p>
        <p className="mt-1 text-xs text-dim">{ad.line}</p>
        <Link
          href={ad.href}
          className="mt-3 inline-block rounded border border-amber px-4 py-1.5 font-mono text-[0.65rem] uppercase tracking-widest text-amber"
        >
          {ad.cta} →
        </Link>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="eyebrow mb-1 text-center">Advertisement</p>
      <ins
        className="adsbygoogle"
        style={{ display: "block", minHeight: 90 }}
        data-ad-client={CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
