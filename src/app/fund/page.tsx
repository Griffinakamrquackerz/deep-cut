import type { Metadata } from "next";
import Link from "next/link";
import FundBar from "@/components/FundBar";
import BallotDemo from "@/components/BallotDemo";
import SkipTheLine from "@/components/SkipTheLine";
import SiteShell, { PageHero, Slate } from "@/components/site/SiteShell";
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
  const share = sharePct();

  return (
    <SiteShell>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <PageHero
        reel="The Indie Film Fund"
        slate="How the money becomes a movie"
        title={
          <>
            You pick <em>the next one.</em>
          </>
        }
        lede={
          <>
            {share}% of everything members put in goes to financing an independent filmmaker&apos;s
            feature — a real one, budgeted between{" "}
            <strong>{money(goal)} and $1 million</strong>. We read every pitch that comes in. The ones
            worth making go on a ballot, and <strong>members decide which gets shot first</strong>. It
            premieres here as a Deep Cut Original.
          </>
        }
        aside={<FundBar />}
      />

      {/* ── How the money moves ──────────────────────────────────── */}
      <section className="lp-section lp-section--tight">
        <div className="lp-wrap">
          <Slate reel="Scene 1">Where the money goes</Slate>
          <h2 className="lp-h3" style={{ marginTop: "1rem" }} data-reveal>
            Three frames, <em>no fine print.</em>
          </h2>
          <div className="lp-strip">
            <ol className="lp-frames lp-frames--3">
              {[
                {
                  big: "$1+",
                  t: "You support",
                  d: `Any amount from $1. ${share}% goes straight into the fund. The other ${100 - share}% keeps the lights on, licenses the shorts in the Theatre, and covers post and delivery on the film we make.`,
                },
                {
                  big: money(goal),
                  t: "The fund fills",
                  d: `The bar above is live. Nothing gets commissioned until it clears $${(goal / 100).toLocaleString("en-US")}, because half a film is no film.`,
                },
                {
                  big: "Ballot",
                  t: "We read, you choose",
                  d: "Every pitch gets read and every reel gets watched. Only films that can actually be made reach the ballot. You spend your votes across the slate; most votes takes the money.",
                },
              ].map((s, i) => (
                <li key={s.t} className="lp-frame" data-reveal="rise" style={{ "--i": i } as React.CSSProperties}>
                  <p className="lp-frame-no">
                    <span>Frame 0{i + 1}</span>
                    <span aria-hidden>DC·{24 + i}A ▸</span>
                  </p>
                  <p className="lp-frame-big">{s.big}</p>
                  <h3>{s.t}</h3>
                  <p className="lp-frame-desc">{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ── Votes, and a ballot to play with ─────────────────────── */}
      <section className="lp-section lp-section--line">
        <div className="lp-wrap lp-ballot">
          <div className="lp-ballot-copy">
            <Slate reel="Scene 2">How voting works</Slate>
            <h2 className="lp-h2" data-reveal>
              $1 = 1 vote. <span className="lp-serif">That&apos;s the whole rule.</span>
            </h2>
            <div className="lp-prose" style={{ marginTop: "1.5rem" }} data-reveal="rise">
              <p>Put in $40, you hold 40 votes.</p>
              <p>
                Your votes are a <strong>budget</strong>. Put all of them behind one pitch, or split them
                across three. Splitting them says which one you&apos;d take if your first choice loses.
              </p>
              <p>
                Votes are capped at <strong>{cap.toLocaleString("en-US")} per person</strong>, which is
                exactly where the producing credits start — a dollar is a vote, so the cap and the
                Co-Producer tier are the same rung. Under it your votes track your money one for one. Over
                it you&apos;re buying credits and access, <strong>not influence</strong>.
              </p>
              <p>
                Give as much as you like: it all counts toward the goal and it all counts toward your
                perks. But the fund exists so the richest person in the room doesn&apos;t pick the movie,
                and that has to include the richest person in <em>this</em> room.
              </p>
              <p className="lp-note">
                Every ballot is shuffled differently for every viewer, because whatever is printed first
                wins votes it didn&apos;t earn.
              </p>
            </div>
          </div>
          <div data-reveal="rise">
            <div className="lp-panel">
              <BallotDemo />
              <p className="lp-ballot-demo-note">
                A practice run with invented films — nothing here counts. A real ballot carries each
                director&apos;s one-sheet, their full pitch deck, and a link to their previous work.
                You&apos;re not voting on a logline.{" "}
                <Link href="/vote" className="lp-link">
                  See the real ballot
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Perks ────────────────────────────────────────────────── */}
      <section className="lp-section lp-section--line">
        <div className="lp-wrap">
          <div className="lp-double-head">
            <div>
              <Slate reel="Scene 3">What you get</Slate>
              <h2 className="lp-h2" data-reveal>
                Your name <em>on the picture.</em>
              </h2>
            </div>
            <p className="lp-lede" data-reveal="rise">
              Perks stack — every tier keeps everything below it. Priced for a real feature: a producing
              credit costs roughly what a producing credit costs, because handing out Executive Producer
              for pocket change makes the credit worthless to everybody who has one.
            </p>
          </div>
          <ul className="lp-perks" style={{ marginTop: "clamp(2rem, 4vw, 3rem)" }}>
            {PERKS.map((p) => (
              <li key={p.minCents} className="lp-perk" data-reveal="rise">
                <p className="lp-perk-price">{money(p.minCents)}+</p>
                <div>
                  <p className="lp-perk-name">{p.name}</p>
                  {p.credit && <p className="lp-perk-credit">Credited as {p.credit}</p>}
                  <p className="lp-perk-line">{perkLine(p, goal)}</p>
                </div>
                <ul>
                  {p.adds.map((a) => (
                    <li key={a}>
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── For filmmakers ──────────────────────────────────────── */}
      <section className="lp-section lp-section--tight">
        <div className="lp-wrap">
          <div className="lp-callout" data-reveal="rise">
            <Slate reel="If you're the one making it" />
            <h2 className="lp-h3" style={{ marginTop: "1rem" }}>
              A script, a reel, <em>and nobody to introduce you.</em>
            </h2>
            <div className="lp-prose" style={{ marginTop: "1.1rem", maxWidth: "44rem" }}>
              <p>
                Deep Cut was built by an indie filmmaker, and the whole reason the fund exists is that
                getting a first feature financed is absurd. If you have a script and a reel, you can
                pitch. There&apos;s no fee, and nobody has to introduce you. Send a one-sheet, a deck,
                and something you&apos;ve made.
              </p>
              <p>
                The people voting are the ones who actually watch this stuff. That&apos;s a better room
                than most festivals put you in front of.
              </p>
            </div>
            <Link href="/submit" className="lp-btn lp-btn--ticket" style={{ marginTop: "1.5rem" }}>
              Submit your film <span aria-hidden>↗</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── The honest small print ──────────────────────────────── */}
      <section className="lp-section lp-section--line">
        <div className="lp-wrap">
          <Slate reel="After the screening">Q&amp;A</Slate>
          <h2 className="lp-h2" data-reveal>
            Straight answers
          </h2>
          <dl className="lp-answers" style={{ marginTop: "clamp(2rem, 4vw, 3rem)" }}>
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
              <div key={f.q}>
                <dt>{f.q}</dt>
                <dd>{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="lp-section lp-final">
        <div className="lp-wrap">
          <p className="lp-serif lp-amber" style={{ fontSize: "1.5rem" }} data-reveal="rise">
            house lights down
          </p>
          <h2 className="lp-h2" data-reveal>
            Take your seat.
          </h2>
          <div className="lp-final-cta" data-reveal="rise">
            <Link href="/#join" className="lp-btn lp-btn--amber">
              Get in line <span aria-hidden>↗</span>
            </Link>
            <p className="lp-mono" style={{ color: "var(--color-dim)", fontSize: "0.6rem" }}>
              Free to join · support if you want to · cancel any time
            </p>
            {/* Somebody who has read this far is the likeliest person on the site
                to give something. Making them go back to the front page, join a
                queue, and wait to be seated before they can is a good way to
                lose them for no reason. */}
            <SkipTheLine />
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
