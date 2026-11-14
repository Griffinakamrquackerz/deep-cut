import type { Metadata } from "next";
import Link from "next/link";
import FundBar from "@/components/FundBar";
import BallotDemo from "@/components/BallotDemo";
import SkipTheLine from "@/components/SkipTheLine";
import MarqueeBulbs from "@/components/MarqueeBulbs";
import { PERKS, perkLine } from "@/lib/perks";
import { goalCents, pointCap, sharePct } from "@/lib/fund";

// The Indie Film Fund, explained end to end.
//
// This page exists because the fund is the most interesting thing Deep Cut
// does and the least self-explanatory. It has to answer, in order: where does
// my money go, what do I get, how does the vote actually work, and what stops
// one rich person deciding everything. Somebody who reads it should be able to
// explain the whole thing to a friend afterwards.
//
// Public and unauthenticated on purpose — it's the pitch.

export const metadata: Metadata = {
  title: "The Indie Film Fund — Deep Cut",
  description:
    "60% of everything members put in finances an independent filmmaker's feature. We read every pitch; members choose which one gets made. It premieres here as a Deep Cut Original.",
};

const money = (cents: number) =>
  cents % 100 === 0
    ? `$${(cents / 100).toLocaleString("en-US")}`
    : `$${(cents / 100).toFixed(2)}`;

export default function FundPage() {
  const cap = pointCap();
  const goal = goalCents();

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-8">
      <div className="flex flex-col gap-10">
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <header className="text-center">
          <MarqueeBulbs />
          <p className="eyebrow mt-3">The Indie Film Fund</p>
          <h1 className="glow-amber mt-1 font-display text-5xl leading-[0.92] text-amber">
            YOU PICK THE
            <br />
            NEXT ONE
          </h1>
          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-cream/90">
            {sharePct()}% of everything members put in goes to financing an
            independent filmmaker&apos;s feature — a real one, budgeted between{" "}
            <span className="text-amber">{money(goal)} and $1 million</span>. We read every
            pitch that comes in. The ones worth making go on a ballot, and{" "}
            <span className="text-amber">members decide which gets shot first</span>.
            It premieres here as a Deep Cut Original.
          </p>
        </header>

        <FundBar />

        {/* ── How the money moves ──────────────────────────────────── */}
        <section>
          <p className="eyebrow mb-3 text-center">Where the money goes</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              {
                n: "01",
                t: "You support",
                d: `Any amount from $1. ${sharePct()}% goes straight into the fund. The other ${100 - sharePct()}% keeps the lights on, licenses the shorts in the Theatre, and covers post and delivery on the film we make.`,
              },
              {
                n: "02",
                t: "The fund fills",
                d: `The bar above is live. Nothing gets commissioned until it clears $${(goal / 100).toLocaleString("en-US")}, because half a film is no film.`,
              },
              {
                n: "03",
                t: "We read, you choose",
                d: "Every pitch gets read and every reel gets watched. Only films that can actually be made reach the ballot. You spend your votes across the slate; most votes takes the money.",
              },
            ].map((s) => (
              <div key={s.n} className="rounded border border-line bg-surface p-4">
                <p className="font-mono text-[0.6rem] tracking-widest text-ticket">{s.n}</p>
                <p className="mt-0.5 font-display text-2xl leading-tight text-cream">{s.t}</p>
                <p className="mt-1.5 text-[0.8rem] leading-relaxed text-dim">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Votes ────────────────────────────────────────────────── */}
        <section>
          <p className="eyebrow mb-2 text-center">How voting works</p>
          <div className="rounded-lg border border-line bg-surface p-4">
            <p className="text-sm leading-relaxed text-cream">
              <span className="font-display text-2xl text-amber">$1 = 1 vote.</span> Put
              in $40, you hold 40 votes. That's the whole rule.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-cream">
              Your votes are a <span className="text-amber">budget</span>. Put all of
              them behind one pitch, or split them across three. Splitting them says
              which one you'd take if your first choice loses.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-cream">
              Votes are capped at{" "}
              <span className="text-amber">{cap.toLocaleString("en-US")} per person</span>,
              which is exactly where the producing credits start — a dollar is a
              vote, so the cap and the Co-Producer tier are the same rung. Under it
              your votes track your money one for one. Over it you&apos;re buying
              credits and access, <span className="text-amber">not influence</span>.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-cream">
              Give as much as you like: it all counts toward the goal and it all counts
              toward your perks. But the fund exists so the richest person in the room
              doesn&apos;t pick the movie, and that has to include the richest person in{" "}
              <em>this</em> room.
            </p>
            <p className="mt-3 border-t border-line pt-3 font-mono text-[0.65rem] leading-relaxed text-dim">
              Every ballot is shuffled differently for every viewer, because whatever is
              printed first wins votes it didn&apos;t earn.
            </p>
          </div>
        </section>

        {/* ── The demo ─────────────────────────────────────────────── */}
        <section>
          <p className="eyebrow mb-2 text-center">The ballot</p>
          <p className="mb-3 text-center text-sm text-dim">
            This is a practice run with invented films. Have a go — nothing here
            counts.
          </p>
          <BallotDemo />
          <p className="mt-3 text-center font-mono text-[0.6rem] leading-relaxed text-dim">
            A real ballot carries each director&apos;s one-sheet, their full pitch deck,
            and a link to their previous work. You&apos;re not voting on a logline.
          </p>
          <p className="mt-3 text-center">
            <Link
              href="/vote"
              className="font-mono text-[0.65rem] uppercase tracking-[0.15em] text-amber underline decoration-amber/40 underline-offset-4"
            >
              See the real ballot →
            </Link>
          </p>
        </section>

        {/* ── Perks ────────────────────────────────────────────────── */}
        <section>
          <p className="eyebrow mb-2 text-center">What you get</p>
          <p className="mb-3 text-center text-sm text-dim">
            Perks stack — every tier keeps everything below it. Priced for a real
            feature: a producing credit costs roughly what a producing credit costs,
            because handing out Executive Producer for pocket change makes the credit
            worthless to everybody who has one.
          </p>
          <ul className="flex flex-col gap-2">
            {PERKS.map((p) => (
              <li key={p.minCents} className="rounded border border-line bg-surface p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-display text-2xl leading-tight text-cream">
                    {p.name}
                  </p>
                  <p className="shrink-0 font-mono text-sm text-amber">
                    {money(p.minCents)}+
                  </p>
                </div>
                {p.credit && (
                  <p className="mt-0.5 font-mono text-[0.6rem] uppercase tracking-widest text-ticket">
                    Credited as {p.credit}
                  </p>
                )}
                <p className="mt-1.5 text-[0.8rem] italic leading-relaxed text-dim">
                  {perkLine(p, goal)}
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {p.adds.map((a) => (
                    <li key={a} className="flex gap-2 text-[0.8rem] text-cream/90">
                      <span aria-hidden className="text-amber">
                        +
                      </span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>

        {/* ── For filmmakers ──────────────────────────────────────── */}
        <section className="rounded-lg border border-ticket/40 bg-ticket/5 p-4">
          <p className="eyebrow text-ticket">If you&apos;re the one making it</p>
          <p className="mt-1.5 text-sm leading-relaxed text-cream">
            Deep Cut was built by an indie filmmaker, and the whole reason the fund
            exists is that getting a first feature financed is absurd. If you have a
            script and a reel, you can pitch. There's no fee, and nobody has to
            introduce you. Send a one-sheet, a deck, and something you've made.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-cream">
            The people voting are the ones who actually watch this stuff. That&apos;s a
            better room than most festivals put you in front of.
          </p>
          <Link
            href="/submit"
            className="mt-3 inline-block rounded bg-ticket px-5 py-2.5 font-mono text-[0.65rem] uppercase tracking-widest text-cream"
          >
            Submit your film →
          </Link>
        </section>

        {/* ── The honest small print ──────────────────────────────── */}
        <section>
          <p className="eyebrow mb-2">Straight answers</p>
          <dl className="flex flex-col gap-3">
            {[
              {
                q: "Am I investing?",
                a: "No. Supporting the house buys you a vote, a credit and the perks above. It isn't an investment, carries no financial return, and no vote has a cash value. If we ever open a proper equity raise it will be a separate, clearly-labelled thing you'd opt into on purpose.",
              },
              {
                q: "What if the fund never fills?",
                a: "Then nothing gets commissioned and the fund keeps growing. What you paid for is a membership — the Theatre, the recommendations, the whole house — and the fund is a share we allocate on top. Nothing is held in escrow against a film that might not happen.",
              },
              {
                q: "Who decides which pitches make the ballot?",
                a: "We do. Anything on the ballot has been read, and the director's previous work has been watched. Backers choose between real options rather than sifting an open submissions pile.",
              },
              {
                q: "Can I change my votes?",
                a: "Any time while the round is open. Move them around as much as you like — the ballot saves what you land on, not each nudge.",
              },
              {
                q: `Does ${money(goal)} actually finish a film?`,
                a: "It shoots one — roughly fifteen to eighteen days with a real crew, a modest cast and controlled locations. Post is separate, and it's where crowd-funded films usually die: sound mix, colour, music clearance, E&O insurance and delivery all cost money after the wrap party, and a film without them legally cannot be shown anywhere. So the goal covers production, and the house covers post and delivery out of its 40%. Nobody gets handed a finished film they can't release.",
              },
              {
                q: "Where does the other 40% go?",
                a: "Hosting, licensing the shorts in the Theatre, paying the filmmakers whose work is on the channels, keeping the thing running — and post and delivery on the film the fund commissions. It is not a marketing budget.",
              },
            ].map((f) => (
              <div key={f.q} className="rounded border border-line bg-surface p-4">
                <dt className="font-display text-xl leading-tight text-cream">{f.q}</dt>
                <dd className="mt-1 text-[0.85rem] leading-relaxed text-dim">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="flex flex-col items-center gap-4 text-center">
          <div>
            <Link
              href="/"
              className="inline-block rounded bg-amber px-6 py-3.5 font-mono text-sm font-medium uppercase tracking-[0.2em] text-bg"
            >
              🎟 Get in line
            </Link>
            <p className="mt-3 font-mono text-[0.6rem] uppercase tracking-widest text-dim">
              Free to join · support if you want to · cancel any time
            </p>
          </div>
          {/* Somebody who has read this far is the likeliest person on the site
              to give something. Making them go back to the front page, join a
              queue, and wait to be seated before they can is a good way to
              lose them for no reason. */}
          <SkipTheLine />
        </section>
      </div>
    </main>
  );
}
