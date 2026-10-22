"use client";
import { useState } from "react";

// A ballot you can play with before you've given a cent.
//
// This explains the mechanic better than any paragraph, because the thing that
// needs explaining is a feeling: you have a pile of votes, and deciding how to
// split them is a genuinely interesting decision. Reading "votes are divisible"
// conveys none of that. Dragging forty of your fifty onto one pitch and then
// changing your mind conveys all of it.
//
// The pitches are invented and labelled as such. Putting real directors in a
// demo would imply they're already in a round that hasn't opened.

const DEMO = [
  {
    id: "a",
    title: "THE LAST VIDEO STORE",
    director: "Mara Oyelaran",
    genre: "Comedy · Drama",
    logline:
      "The night before the last rental shop in town closes, four regulars barricade themselves inside.",
    prior: "Won SXSW Shorts, 2024",
  },
  {
    id: "b",
    title: "SALT FLATS",
    director: "Dev Ramanathan",
    genre: "Thriller",
    logline:
      "A woman driving her dead brother's car across Utah realises someone has been living in the boot.",
    prior: "Two shorts at Sundance",
  },
  {
    id: "c",
    title: "GOOD DOG",
    director: "Priya Halloran",
    genre: "Horror",
    logline:
      "A family adopts a rescue dog that seems to remember a house it has never been to.",
    prior: "Fantastic Fest audience award",
  },
];

const BUDGET = 50;

export default function BallotDemo() {
  const [votes, setVotes] = useState<Record<string, number>>({ a: 0, b: 0, c: 0 });

  const spent = Object.values(votes).reduce((s, n) => s + n, 0);
  const left = BUDGET - spent;
  const leader = Object.entries(votes).sort((x, y) => y[1] - x[1])[0];
  const hasLeader = leader && leader[1] > 0;

  function set(id: string, next: number) {
    // Clamp to what's actually left, so the slider can't promise votes you
    // don't have — a control that lets you overspend and then complains is
    // worse than one that simply stops.
    const others = spent - (votes[id] ?? 0);
    setVotes((v) => ({ ...v, [id]: Math.max(0, Math.min(next, BUDGET - others)) }));
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">Try it — a pretend ballot</p>
        <p className="font-mono text-[0.7rem] text-cream">
          <span className={left === 0 ? "text-ticket" : "text-amber"}>{left}</span>
          <span className="text-dim"> of {BUDGET} votes left</span>
        </p>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {DEMO.map((p) => {
          const mine = votes[p.id] ?? 0;
          const share = spent > 0 ? (mine / spent) * 100 : 0;
          return (
            <div
              key={p.id}
              className={`rounded border p-3 transition-colors ${
                mine > 0 ? "border-amber/50 bg-amber/5" : "border-line bg-bg"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-display text-xl leading-tight text-cream">{p.title}</p>
                <p className="shrink-0 font-mono text-[0.6rem] uppercase tracking-widest text-dim">
                  {p.genre}
                </p>
              </div>
              <p className="mt-0.5 font-mono text-[0.65rem] text-amber">
                dir. {p.director} · {p.prior}
              </p>
              <p className="mt-1.5 text-[0.8rem] leading-relaxed text-dim">{p.logline}</p>

              <div className="mt-2.5 flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={BUDGET}
                  value={mine}
                  onChange={(e) => set(p.id, Number(e.target.value))}
                  aria-label={`Votes for ${p.title}`}
                  className="h-1 flex-1 accent-amber"
                />
                <p className="w-16 shrink-0 text-right font-mono text-[0.7rem] text-cream">
                  <span className="text-amber">{mine}</span>
                  <span className="text-dim"> vote{mine === 1 ? "" : "s"}</span>
                </p>
              </div>

              {mine > 0 && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
                  <div className="h-full bg-amber" style={{ width: `${share}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-3 border-t border-line pt-3 font-mono text-[0.65rem] text-dim">
        {spent === 0
          ? "Slide some votes onto a pitch. Split them however you like — all on one, or spread across three."
          : hasLeader
            ? `As it stands, ${DEMO.find((d) => d.id === leader[0])?.title} takes the money.`
            : ""}
      </p>
    </div>
  );
}
