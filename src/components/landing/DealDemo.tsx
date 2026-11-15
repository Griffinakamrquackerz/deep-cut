"use client";
import { useState } from "react";

// The obscurity dial, with somebody else's hand in it.
//
// The programming half of Deep Cut is hard to describe and easy to feel: you
// say how far down the shelf you want to go, and the film changes. So this
// lets a stranger turn the one control that matters before they've told us a
// single thing about themselves.
//
// THE THREE STOPS ARE THE REAL ONES. The dial in the app runs 3–5, labelled
// niche / obscure / deep cut (see TonightScreen and lib/obscurity.ts), and
// MIN_LESS_SEEN_OBSCURITY is a hard floor in /api/recs — the house does not
// deal crowd-pleasers at any setting. This demo used to open on one, which
// promised a control the product doesn't have.
//
// It's an example and says so: the threads and the notes are written for an
// invented member, and no two hands match. All three films sit on the house
// shelf (src/lib/canon.ts).

const THREADS = ["lonely people in neon cities", "dream logic that never explains itself", "slow burns that pay off"];

const HAND = [
  {
    depth: 3,
    label: "Niche",
    title: "Chungking Express",
    meta: "1994 · Wong Kar-wai",
    hue: "#2f4e5c",
    why: "Two cops nursing breakups in a city that never sits down. Wong shot it in a gap while Ashes of Time was stuck in the edit, and it moves like it.",
  },
  {
    depth: 4,
    label: "Obscure",
    title: "Columbus",
    meta: "2017 · Kogonada",
    hue: "#4e4030",
    why: "Two strangers in Indiana talk about modernist architecture instead of their parents. The slowest burn on the shelf, and the one that pays.",
  },
  {
    depth: 5,
    label: "Deep cut",
    title: "World on a Wire",
    meta: "1973 · Rainer Werner Fassbinder",
    hue: "#4a3a5c",
    why: "A simulated-reality thriller Fassbinder shot for West German television, twenty-six years before The Matrix. Dream logic on a TV budget.",
  },
];

const dots = (n: number) => "◆".repeat(n) + "◇".repeat(5 - n);

export default function DealDemo() {
  const [i, setI] = useState(0);
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
        <span>Obscurity goal</span>
        <input
          type="range"
          min={0}
          max={HAND.length - 1}
          step={1}
          value={i}
          onChange={(e) => setI(Number(e.target.value))}
          aria-valuetext={`${pick.label}: ${pick.title}`}
        />
        <output aria-hidden="true">
          {pick.label}
          <br />
          {dots(pick.depth)}
        </output>
      </label>

      <div className="lp-card example-swap" key={pick.title} aria-live="polite">
        <div className="lp-card-spine" style={{ background: `linear-gradient(160deg, ${pick.hue}, #17110f)` }} aria-hidden="true">
          <span>{pick.title}</span>
          <small>{pick.label}</small>
        </div>
        <div>
          <h4>{pick.title}</h4>
          <p className="lp-card-meta">{pick.meta}</p>
          <p className="lp-card-why">
            <b>Why it&apos;s yours</b>
            {pick.why}
          </p>
        </div>
      </div>

      <p className="lp-deal-note">
        Drag the dial. Your own hand is programmed from the films you mark.
      </p>
    </div>
  );
}
