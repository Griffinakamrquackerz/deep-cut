"use client";
import { useState } from "react";

// The obscurity dial, with somebody else's hand in it.
//
// The recommendation half of Deep Cut is hard to describe and easy to feel:
// you say how far off the map you want to go, and the film changes. So this
// lets a stranger turn the one control that matters before they've told us a
// single thing about themselves.
//
// It is an example and says so. The threads and the reasons are written for an
// invented member — a real deal is built from the films you mark, by the
// engine, and no two hands match. The films are real and all four sit on the
// house shelf (src/lib/canon.ts).

const THREADS = ["lonely people in neon cities", "dream logic that never explains itself", "slow burns that pay off"];

const HAND = [
  {
    depth: 2,
    label: "Crowd-pleaser",
    title: "Lost in Translation",
    meta: "2003 · Sofia Coppola",
    hue: "#6d3a4e",
    why: "Two strangers adrift in a Tokyo hotel. Your loneliest thread, at its most quotable.",
  },
  {
    depth: 3,
    label: "Less seen",
    title: "Chungking Express",
    meta: "1994 · Wong Kar-wai",
    hue: "#2f4e5c",
    why: "Lovesick cops, expiring pineapple and a Hong Kong that never sleeps. Same ache, twice the pulse.",
  },
  {
    depth: 4,
    label: "Deep cut",
    title: "World on a Wire",
    meta: "1973 · Rainer Werner Fassbinder",
    hue: "#4a3a5c",
    why: "A simulated-reality noir made for German television, a quarter-century before The Matrix.",
  },
  {
    depth: 5,
    label: "Buried treasure",
    title: "Liquid Sky",
    meta: "1982 · Slava Tsukerman",
    hue: "#7a2e2e",
    why: "Tiny aliens land on a downtown New York rooftop. Neon, synths, and nobody supervising.",
  },
];

const dots = (n: number) => "◆".repeat(n) + "◇".repeat(5 - n);

export default function DealDemo() {
  const [i, setI] = useState(1);
  const pick = HAND[i];

  return (
    <div className="lp-deal">
      <div className="lp-deal-top">
        <span>An example hand</span>
        <span>Taste threads</span>
      </div>
      <div className="lp-threads">
        {THREADS.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>

      <label className="lp-dial">
        <span>Obscurity</span>
        <input
          type="range"
          min={0}
          max={HAND.length - 1}
          step={1}
          value={i}
          onChange={(e) => setI(Number(e.target.value))}
          aria-valuetext={`${pick.label}: ${pick.title}`}
        />
        <output aria-hidden="true">{dots(pick.depth)}</output>
      </label>

      <div className="lp-card example-swap" key={pick.title} aria-live="polite">
        <div className="lp-card-spine" style={{ background: `linear-gradient(160deg, ${pick.hue}, #17110f)` }} aria-hidden="true">
          <span>{pick.title}</span>
          <small>{pick.label}</small>
        </div>
        <div>
          <h4>{pick.title}</h4>
          <p className="lp-card-meta">
            {pick.meta} · {pick.label}
          </p>
          <p className="lp-card-why">
            <b>Why it&apos;s yours</b>
            {pick.why}
          </p>
        </div>
      </div>

      <p className="lp-deal-note">
        Drag the dial. This hand is an example &mdash; yours is dealt from the films you mark, with a reason on
        every card.
      </p>
    </div>
  );
}
