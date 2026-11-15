import Link from "next/link";
import { Suspense } from "react";
import MarqueeBulbs from "@/components/MarqueeBulbs";
import FeaturedReel from "@/components/FeaturedReel";
import WaitlistForm from "@/components/WaitlistForm";
import FundBar from "@/components/FundBar";
import FounderNote from "@/components/FounderNote";
import BallotDemo from "@/components/BallotDemo";
import ProjectorHero from "@/components/landing/ProjectorHero";
import LandingFX from "@/components/landing/LandingFX";
import SiteNav from "@/components/site/SiteNav";
import SiteCredits from "@/components/site/SiteCredits";
import { Slate } from "@/components/site/SiteShell";
import DealDemo from "@/components/landing/DealDemo";
import { goalCents, sharePct } from "@/lib/fund";
import { lifetimeConfigured } from "@/lib/stripe";
import { CHANNELS } from "@/lib/shorts";
import { PERKS } from "@/lib/perks";
import "@/components/landing/landing.css";
import RatingBand from "@/components/house/RatingBand";

// The front door.
//
// Deep Cut is two things at once —
//
//   THE DEAL        a repertory house that programs for one person
//   THE GREENLIGHT  an indie streaming house whose members vote, with points
//                   they earn by supporting it, on which original gets made
//
// — built by a working filmmaker, for the people who watch films and the
// people who make them. The page is staged as the thing those people would
// recognise on sight: a 16mm projector on a crate, throwing the pitch at a
// wall. The headline is what's on the wall.
//
// THE FIFTEEN-SECOND RULE. A stranger should know what this is before they
// scroll. So the wall carries the whole pitch: a headline in two halves, and
// under each half one sentence saying what it means. Everything below the
// fold is evidence for those two sentences, not a second telling of them.
//
// ONE FACT, ONE PLACE. The page this replaced ran to 2,187 words, and most of
// the excess was the same four facts (the fund's share, a dollar is a vote,
// every pitch gets read, credits for backers) restated in eight sections.
// Each now appears once. The long version of anything lives a click away:
//
//   how the programming works   /deal
//   how the fund works, perks   /fund
//   the ballot                  /vote
//   the founder's whole letter  /about
//
// If a section here starts growing a second paragraph, it belongs on one of
// those pages instead.
//
// Vocabulary is deliberate and matches src/lib/fund.ts: members SUPPORT, they
// earn POINTS, points are VOTES, a backer gets a CREDIT. Nobody invests and
// nothing is a stake. Keep it that way in any copy added here.

const usd = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

export default function Landing({ posters, open = false }: { posters: string[]; open?: boolean | null }) {
  // Only a confirmed-open door gets a signup button. Unknown reads as closed:
  // promising an open door that isn't is worse than under-promising one.
  const doorOpen = open === true;
  const joinHref = doorOpen ? "/login?mode=signup" : "#join";
  const joinLabel = doorOpen ? "Take your seat" : "Get in line";
  const share = sharePct();
  const goal = usd(goalCents());
  const channels = CHANNELS.length;
  // The cheapest tier that carries a screen credit, read off the ladder.
  const creditFrom = usd(Math.min(...PERKS.filter((p) => p.credit).map((p) => p.minCents)));

  const ticker = [
    "Movies you haven't seen yet",
    `${channels} channels of short films`,
    "Members pick what gets made",
    "Every pitch gets read",
    "Backers go in the credits",
  ];

  return (
    <div className="lp">
      <LandingFX />
      <a href="#feature" className="lp-skip">
        Skip to what Deep Cut is
      </a>

      <SiteNav cta={{ href: joinHref, label: joinLabel }} />

      <main>
      {/* ══════════ REEL ONE — the projection ══════════ */}
      <header className="lp-hero">
        <ProjectorHero
          cta={
            <div id="join" style={{ scrollMarginTop: "6rem" }}>
              <div className="lp-cta-row">
                {doorOpen ? (
                  <Link href={joinHref} className="lp-btn lp-btn--ticket pulse-cta">
                    Take your seat &mdash; it&apos;s free <span aria-hidden>↗</span>
                  </Link>
                ) : (
                  <WaitlistForm />
                )}
                <a href="#feature" className="lp-btn lp-btn--ghost">
                  See both features <span aria-hidden>↓</span>
                </a>
              </div>
              {/* The same three facts as the admission board. On a desk the
                  board is showing, so this line stands down (see .lp-bill). */}
              <p className="lp-cta-proof" style={{ marginTop: "0.9rem" }}>
                <span>Free to join</span>
                <span>{channels} channels of shorts</span>
                <span>$1 = 1 vote</span>
              </p>
            </div>
          }
          bill={
            // The board by the box office: what it costs and what's on. The
            // two features are already named on the wall, so the board says
            // the things the wall doesn't.
            <aside className="lp-bill" aria-label="Admission">
              <MarqueeBulbs count={12} />
              <p className="lp-bill-top">Tonight · admission</p>
              <a href="#join" className="lp-bill-row lp-bill-row--adm">
                <b>Free</b>
                <em>to join</em>
              </a>
              <a href="#theatre" className="lp-bill-row lp-bill-row--adm">
                <b>{channels}</b>
                <em>channels of short films</em>
              </a>
              <a href="#greenlight" className="lp-bill-row lp-bill-row--adm">
                <b>$1 = 1</b>
                <em>vote on what gets made</em>
              </a>
              <p className="lp-bill-foot">Two pictures · one ticket</p>
            </aside>
          }
        >
          <p className="lp-kicker" style={{ "--i": 0 } as React.CSSProperties}>
            <span>Made by a filmmaker</span>
            <span className="lp-kicker-rule" aria-hidden />
            <span>for people who stay through the credits</span>
          </p>
          <h1 className="lp-title" style={{ "--i": 1 } as React.CSSProperties}>
            <span>
              <em>Find</em> the films
            </span>
            <span>you&apos;ve never seen.</span>
            <span className="lp-title-gap">
              <em>Fund</em> the ones
            </span>
            <span>that don&apos;t exist yet.</span>
          </h1>
          {/* One sentence under each half of the headline. This is the whole
              pitch; it has to survive being the only thing anybody reads. */}
          <div className="lp-gloss" style={{ "--i": 3 } as React.CSSProperties}>
            <a href="#deal">
              <b>Find</b>
              Mark the films you love. The house programs ones you haven&apos;t seen, and says where
              to stream them.
            </a>
            <a href="#greenlight">
              <b>Fund</b>
              {share}% of paid support goes into a film fund. Members vote on which original gets
              made.
            </a>
          </div>
        </ProjectorHero>
      </header>

      {/* The marquee. Doubled so the loop has no seam; the copy is read once. */}
      <div className="lp-ticker">
        <div className="lp-ticker-track">
          {[0, 1, 2, 3].map((n) => (
            <p key={n} aria-hidden={n > 0}>
              {ticker.map((t) => (
                <span key={t}>
                  {t} <i aria-hidden>&nbsp;&nbsp;★</i>
                </span>
              ))}
            </p>
          ))}
        </div>
      </div>

      <div className="lp-body">
        <div className="lp-perfs lp-perfs--l" aria-hidden />
        <div className="lp-perfs lp-perfs--r" aria-hidden />
        <div className="lp-edgeprint" aria-hidden />

        {/* ══════════ FEATURE ONE — the programming ══════════ */}
        <section id="feature" aria-labelledby="deal-title" className="lp-section lp-feature">
          {/* The card before every trailer ever cut. It is worded the way the
              real one is — "approved for all audiences", then a box naming
              what's on — because the card is the joke and anything clever
              written on it is a second one. The box doubles as the contents
              page for the two sections below. */}
          <div className="lp-wrap lp-band" data-reveal="rise">
            <RatingBand
              what="double feature"
              audience="all audiences"
              label="Two features"
              fine="The Deal: movies you haven't seen yet. The Greenlight: you decide what gets made."
            />
          </div>
          <div id="deal" className="lp-wrap lp-feature-grid" style={{ scrollMarginTop: "5rem" }}>
            <div>
              <Slate reel="Feature one">The Deal</Slate>
              <h2 id="deal-title" className="lp-h2" data-reveal>
                Movies you <em>haven&apos;t seen</em> yet
              </h2>
              <p className="lp-lede" data-reveal="rise">
                Mark the films you love. The house programs ones you haven&apos;t seen, each with a note on
                why it&apos;s yours and which service has it tonight.
              </p>
              {/* The three rooms that need no account. A stranger can be
                  inside the product one tap from here, which is worth more
                  than a bullet describing each. */}
              <div className="lp-plates" data-reveal="rise">
                <p className="lp-plates-label">Three doors are open without a ticket</p>
                <div className="lp-plates-row">
                  <Link href="/settle" className="door-plate">
                    <small>Two people, one film</small>
                    Settle It
                  </Link>
                  <Link href="/roll" className="door-plate">
                    <small>Trailers, back to back</small>
                    Just Roll It
                  </Link>
                  <Link href="/blend" className="door-plate">
                    <small>Splice two films</small>
                    This Meets That
                  </Link>
                </div>
              </div>
              <div className="lp-feature-foot">
                <a href={joinHref} className="lp-btn lp-btn--amber">
                  {doorOpen ? "Get dealt in" : "Get in line"} <span aria-hidden>↗</span>
                </a>
                <Link href="/deal" className="lp-more">
                  How the Deal works
                </Link>
              </div>
            </div>
            <div className="lp-feature-demo" data-reveal="rise">
              {posters.length > 0 && (
                <div className="lp-wall" aria-hidden>
                  {posters.slice(0, 12).map((poster, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={`${poster}-${i}`}
                      src={`https://image.tmdb.org/t/p/w185${poster}`}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  ))}
                </div>
              )}
              <DealDemo />
            </div>
          </div>
        </section>

        {/* "PLUS!" — the starburst between two halves of a double bill. */}
        <p className="lp-plus" aria-hidden>
          <span>
            PLUS!
            <small>2nd big feature</small>
          </span>
        </p>

        {/* ══════════ FEATURE TWO — the greenlight ══════════ */}
        <section
          id="greenlight"
          aria-labelledby="greenlight-title"
          className="lp-section lp-feature lp-feature--green lp-how"
          style={{ scrollMarginTop: "3rem" }}
        >
          <div className="lp-wrap lp-feature-grid lp-feature-grid--flip">
            <div>
              <Slate reel="Feature two">The Greenlight</Slate>
              <h2 id="greenlight-title" className="lp-h2" data-reveal>
                You decide <em>what gets made</em>
              </h2>
              <p className="lp-lede" data-reveal="rise">
                {share}% of paid support goes into a fund for an independent filmmaker&apos;s feature.
                Filmmakers pitch, members vote, and the winner premieres here as a Deep Cut Original.
              </p>
              <dl className="lp-stats" data-reveal="rise">
                <div>
                  <dt>{share}%</dt>
                  <dd>of paid support, to the fund</dd>
                </div>
                <div>
                  <dt>$1 = 1</dt>
                  <dd>a dollar in is a vote</dd>
                </div>
                <div>
                  <dt>{creditFrom}</dt>
                  <dd>puts your name in the credits</dd>
                </div>
              </dl>
              <div className="lp-feature-foot">
                <Link href="/vote" className="lp-btn lp-btn--ticket">
                  See the ballot <span aria-hidden>↗</span>
                </Link>
                <Link href="/fund" className="lp-more">
                  How the fund works
                </Link>
              </div>
            </div>
            <div className="lp-feature-demo lp-feature-demo--bare" data-reveal="rise">
              <div className="lp-ballot-demo">
                <BallotDemo />
                <p className="lp-ballot-demo-note">A practice run with invented films. Nothing here counts.</p>
              </div>
            </div>
          </div>

          {/* How the money becomes a film, as five frames of one strip. The
              frames are captions, not paragraphs — /fund has the paragraphs. */}
          <div id="how" className="lp-wrap lp-how-block" style={{ scrollMarginTop: "5rem" }}>
            <div className="lp-how-head">
              <h3 className="lp-h3" data-reveal>
                How a film <em>gets made</em> here
              </h3>
              <Link href="/fund" className="lp-more">
                The fund, end to end
              </Link>
            </div>
            <div className="lp-strip">
              <ol className="lp-frames lp-frames--slim">
                {[
                  { big: "Free", t: "Take a seat" },
                  { big: `${share}%`, t: "Goes in the pot" },
                  { big: "Pitch", t: "Filmmakers send films" },
                  { big: "$1 = 1", t: "Members vote" },
                  { big: "Action", t: "The winner gets made" },
                ].map((f, i) => (
                  <li key={f.t} className="lp-frame" data-reveal="rise" style={{ "--i": i } as React.CSSProperties}>
                    <p className="lp-frame-no">
                      <span>Frame 0{i + 1}</span>
                      <span aria-hidden>DC·{24 + i}A ▸</span>
                    </p>
                    <p className="lp-frame-big">{f.big}</p>
                    <h4>{f.t}</h4>
                  </li>
                ))}
              </ol>
            </div>
            <div className="lp-how-foot">
              <div className="lp-how-fund">
                <FundBar compact />
              </div>
              <p className="lp-smallprint">
                <strong>Not an investment.</strong> Paid support earns votes and counts toward perk tiers.
                It carries no financial return, and no vote has a cash value.
              </p>
            </div>
          </div>
        </section>

        {/* ══════════ SHORT SUBJECTS — the screening room ══════════ */}
        <section id="theatre" aria-labelledby="theatre-title" className="lp-section lp-room">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="lp-room-photo" src="/scene/room.jpg?v=3" alt="" loading="lazy" decoding="async" />
          <div className="lp-wrap">
            <div className="lp-room-head">
              <Slate reel="Short subjects">The Deep Cut Theatre</Slate>
              <h2 id="theatre-title" className="lp-h2" data-reveal>
                {channels} channels. <em>All night.</em> All free.
              </h2>
              <p className="lp-lede" data-reveal="rise">
                Award-winning short films off the festival circuit, programmed by hand. A new bill every
                month.
              </p>
            </div>

            <div className="lp-guide" data-reveal="rise">
              {CHANNELS.map((c, i) => (
                <div key={c.key} className="lp-ch">
                  <span className="lp-ch-no">CH {String(i + 1).padStart(2, "0")}</span>
                  <span className="lp-ch-name">{c.label}</span>
                  <span className="lp-ch-blurb">{c.blurb}</span>
                </div>
              ))}
              <Link href="/tv" className="lp-ch lp-ch--cta">
                <span className="lp-ch-name">
                  Enter the Theatre <span aria-hidden>↗</span>
                </span>
                <span className="lp-mono">A free account plays everything</span>
              </Link>
            </div>
          </div>
        </section>

        {/* ══════════ Intermission — the shelf ══════════ */}
        <section aria-labelledby="shelf-title" className="lp-section lp-shelf">
          <div className="lp-wrap">
            <div className="lp-shelf-head">
              <div>
                <Slate reel="Intermission">From the programmer&apos;s shelf</Slate>
                <h2 id="shelf-title" className="lp-h2" data-reveal>
                  The house picks
                </h2>
              </div>
              <p className="lp-lede" data-reveal="rise" style={{ marginTop: 0 }}>
                The bar is whether a rep theater would put it on a midnight double bill. Tap a poster.
              </p>
            </div>
            <Suspense fallback={<p className="lp-room-note">Pulling the house picks…</p>}>
              <FeaturedReel />
            </Suspense>
          </div>
        </section>

        {/* ══════════ Director's statement ══════════ */}
        <section id="founder" aria-labelledby="founder-title" className="lp-section lp-founder">
          <div className="lp-wrap lp-founder-grid">
            <div className="lp-founder-copy">
              <Slate reel="Director&apos;s statement">Griffin Howes · founder</Slate>
              <h2 id="founder-title" className="lp-h2" data-reveal>
                Made by a filmmaker. <span className="lp-serif">For people who stay through the credits.</span>
              </h2>
            </div>
            <div className="lp-paper" data-reveal="rise">
              <p className="lp-paper-head">
                <b>Director&apos;s statement</b>
                <span>Deep Cut · press kit · p. 1</span>
              </p>
              {/* The opening of the letter, word for word. The rest of it is
                  how the fund works, which this page has already said. */}
              <FounderNote excerpt />
              <p className="lp-paper-more">
                <Link href="/about" className="lp-more">
                  Read the whole statement
                </Link>
              </p>
            </div>
          </div>
        </section>

        {/* ══════════ Two doors ══════════ */}
        <section id="filmmakers" aria-labelledby="doors-title" className="lp-section lp-section--line">
          <div className="lp-wrap">
            <Slate reel="Pick your door">Audience · filmmakers</Slate>
            <h2 id="doors-title" className="lp-h2" data-reveal>
              For the people who watch them. <em>And the people who make them.</em>
            </h2>

            <div className="lp-doors">
              <article className="lp-door" data-reveal="rise">
                <p className="lp-door-for">If you watch them</p>
                <h3>You&apos;ve seen the top row of every app.</h3>
                <ul>
                  <li>A bill programmed off your own shelf</li>
                  <li>{channels} channels of shorts the big apps don&apos;t carry</li>
                  <li>A vote on the next Deep Cut Original</li>
                </ul>
                <div className="lp-door-foot">
                  <a href={joinHref} className="lp-btn lp-btn--amber">
                    {joinLabel} <span aria-hidden>↗</span>
                  </a>
                </div>
              </article>

              <article className="lp-door lp-door--maker" data-reveal="rise" style={{ "--i": 1 } as React.CSSProperties}>
                <p className="lp-door-for">If you make them</p>
                <h3>You have a script and a reel.</h3>
                <ul>
                  <li>No fee, no agent, nobody has to introduce you</li>
                  <li>Every pitch read, every reel watched</li>
                  <li>A feature budget from {goal}, and a premiere here</li>
                </ul>
                <div className="lp-door-foot">
                  <Link href="/submit" className="lp-btn lp-btn--ticket">
                    Submit your film <span aria-hidden>↗</span>
                  </Link>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ══════════ The Q&A ══════════ */}
        <section aria-labelledby="faq-title" className="lp-section lp-section--line">
          <div className="lp-wrap lp-faq-grid">
            <div>
              <Slate reel="After the screening">Q&amp;A</Slate>
              <h2 id="faq-title" className="lp-h2" data-reveal>
                Straight answers
              </h2>
              <p style={{ marginTop: "1.5rem" }}>
                <Link href="/fund" className="lp-more">
                  The fund, end to end
                </Link>
              </p>
            </div>
            <div className="lp-faq" data-reveal="rise">
              <details>
                <summary>Is it free?</summary>
                <p>
                  Yes. Joining and using Deep Cut is free. You can optionally subscribe for the full app or
                  buy voting points; both earn votes on the current film round.
                </p>
              </details>
              <details>
                <summary>Am I investing in a movie?</summary>
                <p>
                  No. Paid support earns votes and counts toward perk tiers; credits start at {creditFrom}.
                  It isn&apos;t an investment, carries no financial return, and no vote has a cash value.
                </p>
              </details>
              <details>
                <summary>Who decides what reaches the ballot?</summary>
                <p>
                  We do. Anything on the ballot has been read, and the director&apos;s previous work has been
                  watched. Members choose between films that can actually be made.
                </p>
              </details>
              <details>
                <summary>What if the fund never fills?</summary>
                <p>
                  Then nothing gets commissioned and the fund keeps growing. Subscriptions pay for membership
                  &mdash; the Theatre, the programming, the whole house; points purchases buy voting points.
                  Nothing is held in escrow against a film that might not happen.
                </p>
              </details>
            </div>
          </div>
        </section>
      </div>

      {/* ══════════ Last call ══════════ */}
      <section aria-labelledby="final-title" className="lp-section lp-final">
        <div className="lp-wrap">
          <p className="lp-serif lp-amber" style={{ fontSize: "1.5rem" }} data-reveal="rise">
            house lights down
          </p>
          <h2 id="final-title" className="lp-h2" data-reveal>
            Take your seat.
          </h2>
          <div className="lp-final-cta" data-reveal="rise">
            {doorOpen ? (
              <Link href={joinHref} className="lp-btn lp-btn--ticket pulse-cta">
                Take your seat &mdash; it&apos;s free <span aria-hidden>↗</span>
              </Link>
            ) : (
              <WaitlistForm compact />
            )}
            <Link href="/submit" className="lp-link">
              Making one yourself? Send us your film
            </Link>
            {lifetimeConfigured() && (
              <Link href="/settings" className="lp-link">
                $150 lifetime premium · first 1,000 lifetime buyers, when available · plus applicable tax
              </Link>
            )}
          </div>
        </div>
      </section>

      </main>

      <SiteCredits />
    </div>
  );
}
