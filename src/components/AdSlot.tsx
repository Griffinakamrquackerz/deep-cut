"use client";
import { useEffect } from "react";
import Link from "next/link";

// Ad slot in the Letterboxd style. Two modes:
// - publisher id AND ad-unit id both configured: a real AdSense unit.
// - otherwise: a themed "house ad" promoting the app's own loops, so the
//   placement exists (and is measured) before the ad account is approved.
//
// AD_UNIT is the numeric ad-unit id from the dashboard, and is NOT the `slot`
// prop below. The props are friendly names — "tonight-feed", "lobby-feed" —
// which label placements and rotate the house ads; data-ad-slot wants the
// number Google generates. It used to get "tonight-feed", and one placement
// passed no name at all, either of which renders a blank box with a console
// error on the day the publisher id is set and not before — the kind of thing
// that looks like "AdSense hasn't approved us yet" for a week.
//
// One unit id for every placement, because they are all the same responsive
// display unit. Per-placement reporting is what the `slot` label is for, and
// it isn't worth six dashboard units and six env vars on day one.
import { ADSENSE_CLIENT as CLIENT, ADSENSE_SLOT as AD_UNIT } from "@/lib/adsense";

// Plain sentences, on purpose. These used to read "Playlists are tickets —
// every one you share fills the lobby", which is the house talking like an
// advertising agency. Nobody says that. Same rule as the founder note and
// HouseCall: ordinary words, and no line arranged for how it sounds.
const HOUSE_ADS = [
  {
    eyebrow: "Intermission",
    title: "MAKE SOMEONE A MIXTAPE",
    line: "Put a few films in a list and send it to a friend.",
    href: "/playlists",
    cta: "Make one",
  },
  {
    eyebrow: "Intermission",
    title: "YOUR TASTE CARD",
    line: "See what everything you've rated adds up to.",
    href: "/you",
    cta: "See yours",
  },
  {
    eyebrow: "Intermission",
    title: "GO DEEPER",
    line: "Turn the obscurity dial up. There's a lot further down to go.",
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
    if (!CLIENT || !AD_UNIT) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Ad blockers throw here — never let that break the page.
    }
  }, []);

  // House ad until BOTH halves are configured. A client id without an ad unit
  // renders an empty box rather than an advert, and an empty box is worse than
  // the house ad it replaced.
  if (!CLIENT || !AD_UNIT) {
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
        data-ad-slot={AD_UNIT}
        data-ad-placement={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
