import type { Metadata } from "next";
import Link from "next/link";
import SiteShell, { PageHero, Slate } from "@/components/site/SiteShell";
import DealDemo from "@/components/landing/DealDemo";

// The Deal, explained end to end.
//
// The front page gives the programming half one sentence and a dial to turn.
// This is where the rest of it went: how a bill gets programmed, what the dial
// does, and the rooms that need no account. It is the "learn more" behind the
// front page's first feature, the way /fund is behind the second.
//
// Public, static, and it says nothing the product doesn't do: the dial has
// three stops (niche / obscure / deep cut) and a hard floor — the house does
// not deal crowd-pleasers at any setting. See DealDemo and lib/obscurity.ts.

export const metadata: Metadata = {
  title: "The Deal — how Deep Cut programs your night",
  description:
    "Mark the films you love. Deep Cut programs films you haven't seen, each with a note on why it's yours and which service has it tonight.",
};

const STEPS = [
  {
    big: "Shelf",
    t: "Mark the films you love",
    d: "The house reads your shelf and names what keeps coming up. Those are your taste threads.",
  },
  {
    big: "Dial",
    t: "Set how far down to go",
    d: "Niche, obscure, or deep cut. The top row never makes the bill; the dial sets how far past it you go.",
  },
  {
    big: "Bill",
    t: "Get tonight's films",
    d: "Films you haven't seen, each with a line on why it's on your bill and which service has it tonight.",
  },
];

const DOORS = [
  {
    href: "/settle",
    name: "Settle It",
    kind: "Two people, one film",
    d: "Two people, one couch, a quiz. The house rules on what you're watching.",
    go: "Open the case",
  },
  {
    href: "/roll",
    name: "Just Roll It",
    kind: "Trailers, back to back",
    d: "A lean-back channel of deep-cut trailers that rolls until one grabs you.",
    go: "Tune in",
  },
  {
    href: "/blend",
    name: "This Meets That",
    kind: "Splice two films",
    d: "Splice two or three films together. See what plays.",
    go: "To the bench",
  },
];

export default function DealPage() {
  return (
    <SiteShell>
      <PageHero
        reel="The Deal"
        slate="How the programming works"
        title={
          <>
            Movies you <em>haven&apos;t seen yet.</em>
          </>
        }
        lede={
          <>
            Mark the films you love. The house reads your shelf and names what keeps coming up &mdash; your{" "}
            <strong>taste threads</strong>. Then it programs against them: films you haven&apos;t seen, each
            with a line on why it&apos;s on your bill and which service has it tonight.
          </>
        }
        aside={
          <div className="lp-panel">
            <DealDemo />
          </div>
        }
      />

      {/* ── How a bill gets programmed ───────────────────────────── */}
      <section className="lp-section lp-section--tight">
        <div className="lp-wrap">
          <Slate reel="Scene 1">From your shelf to tonight</Slate>
          <h2 className="lp-h3" style={{ marginTop: "1rem" }} data-reveal>
            Three frames, <em>start to bill.</em>
          </h2>
          <div className="lp-strip">
            <ol className="lp-frames lp-frames--3">
              {STEPS.map((s, i) => (
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

      {/* ── The three rooms that need no account ─────────────────── */}
      <section className="lp-section lp-section--line">
        <div className="lp-wrap">
          <Slate reel="Scene 2">Open without a ticket</Slate>
          <h2 className="lp-h2" data-reveal>
            Three doors <em>off the lobby</em>
          </h2>
          <p className="lp-lede" data-reveal="rise">
            None of these needs an account. Walk in.
          </p>
          <div className="lp-doors lp-doors--3">
            {DOORS.map((d, i) => (
              <article key={d.href} className="lp-door" data-reveal="rise" style={{ "--i": i } as React.CSSProperties}>
                <p className="lp-door-for">{d.kind}</p>
                <h3>{d.name}</h3>
                <p className="lp-door-desc">{d.d}</p>
                <div className="lp-door-foot">
                  <Link href={d.href} className="lp-btn lp-btn--amber">
                    {d.go} <span aria-hidden>↗</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── What else is in the house ────────────────────────────── */}
      <section className="lp-section lp-section--tight lp-section--line">
        <div className="lp-wrap">
          <div className="lp-callout lp-callout--amber" data-reveal="rise">
            <Slate reel="Also in the house" />
            <h2 className="lp-h3" style={{ marginTop: "1rem" }}>
              Mixtapes <em>and hot takes.</em>
            </h2>
            <div className="lp-prose" style={{ marginTop: "1.1rem", maxWidth: "44rem" }}>
              <p>Movie playlists to hand a friend, and a wall to argue on.</p>
            </div>
            <p style={{ marginTop: "1.5rem", display: "flex", flexWrap: "wrap", gap: "1rem 1.5rem", alignItems: "center" }}>
              <Link href="/#join" className="lp-btn lp-btn--ticket">
                Get in line <span aria-hidden>↗</span>
              </Link>
              <Link href="/fund" className="lp-more">
                The other feature: the fund
              </Link>
            </p>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
