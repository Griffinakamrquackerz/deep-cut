import Link from "next/link";
import { Suspense } from "react";
import { Instrument_Serif } from "next/font/google";
import MarqueeBulbs from "@/components/MarqueeBulbs";
import FeaturedReel from "@/components/FeaturedReel";
import WaitlistForm from "@/components/WaitlistForm";
import FundBar from "@/components/FundBar";
import FounderNote from "@/components/FounderNote";
import BallotDemo from "@/components/BallotDemo";
import ProjectorHero from "@/components/landing/ProjectorHero";
import LandingFX from "@/components/landing/LandingFX";
import DealDemo from "@/components/landing/DealDemo";
import { goalCents, pointCap, sharePct } from "@/lib/fund";
import { CHANNELS } from "@/lib/shorts";
import "@/components/landing/landing.css";

// The front door.
//
// Deep Cut is two things at once, and the page before this one sold neither:
// it read as a streaming site with a recommendation feature and a donation
// link. The actual pitch is a double feature —
//
//   THE DEAL        a recommendation engine for people who've seen the top row
//   THE GREENLIGHT  an indie streaming house whose members vote, with points
//                   they earn by supporting it, on which original gets made
//
// — built by a working filmmaker, for the people who watch films and the
// people who make them. So the page is staged as the thing those people would
// recognise on sight: a 16mm projector on a crate, throwing the pitch at a
// wall. The headline is what's on the wall.
//
// Order follows the argument, not the feature list: what it is (hero) → that
// it's two things (double feature) → how the money becomes a film (the strip,
// then a ballot you can play with) → the streaming half → proof of taste (the
// shelf) → who made it and why → which door is yours → the objections → ask.
//
// Vocabulary is deliberate and matches src/lib/fund.ts: members SUPPORT, they
// earn POINTS, points are VOTES, a backer gets a CREDIT. Nobody invests and
// nothing is a stake. Keep it that way in any copy added here.

// The one face the rest of the app doesn't carry: title-card italics. Loaded
// from this module so only the front door pays for it.
const serif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif-title",
  display: "swap",
});

const usd = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

function Slate({ reel, children }: { reel: string; children: React.ReactNode }) {
  return (
    <p className="lp-slate">
      <b>{reel}</b>
      <span>{children}</span>
    </p>
  );
}

export default function Landing({ posters, open = false }: { posters: string[]; open?: boolean | null }) {
  // Only a confirmed-open door gets a signup button. Unknown reads as closed:
  // promising an open door that isn't is worse than under-promising one.
  const doorOpen = open === true;
  const joinHref = doorOpen ? "/login?mode=signup" : "#join";
  const joinLabel = doorOpen ? "Take your seat" : "Get in line";
  const share = sharePct();
  const goal = usd(goalCents());
  const cap = pointCap().toLocaleString("en-US");
  const channels = CHANNELS.length;

  const ticker = [
    "Movies you haven't seen yet",
    `${channels} channels of award-winning shorts`,
    `${share}% of every dollar funds an indie feature`,
    "$1 = 1 vote",
    "Members pick what gets made",
    "Every pitch gets read",
    "Backers go in the credits",
    "Built by a filmmaker",
  ];

  return (
    <main className={`lp ${serif.variable}`}>
      <LandingFX />
      <a href="#feature" className="lp-skip">
        Skip to what Deep Cut is
      </a>

      <nav aria-label="Main navigation" className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <Link href="/" className="lp-logo">
            DEEP CUT<span className="lp-ticket">.</span>
          </Link>
          <div className="lp-nav-links">
            <a href="#deal">The Deal</a>
            <a href="#greenlight">The Greenlight</a>
            <a href="#how">How a film gets made</a>
            <a href="#filmmakers">Filmmakers</a>
          </div>
          <div className="lp-nav-right">
            <Link href="/login" className="lp-nav-signin">
              Sign in
            </Link>
            <a href={joinHref} className="lp-btn lp-btn--ticket lp-nav-cta">
              {joinLabel}
            </a>
          </div>
        </div>
      </nav>

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
                <a href="#how" className="lp-btn lp-btn--ghost">
                  How a film gets made <span aria-hidden>↓</span>
                </a>
              </div>
              <p className="lp-cta-proof" style={{ marginTop: "0.9rem" }}>
                <span>Free to join</span>
                <span>{channels} channels of shorts</span>
                <span>$1 = 1 vote on what gets made</span>
              </p>
            </div>
          }
          bill={
            <aside className="lp-bill" aria-label="Tonight's double feature">
              <MarqueeBulbs count={12} />
              <p className="lp-bill-top">Tonight · double feature</p>
              <a href="#deal" className="lp-bill-row">
                <b>
                  <small>01</small> The Deal
                </b>
                <em>movies you haven&apos;t seen yet</em>
              </a>
              <a href="#greenlight" className="lp-bill-row">
                <b>
                  <small>02</small> The Greenlight
                </b>
                <em>you pick what gets made</em>
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
          <p className="lp-sub" style={{ "--i": 3 } as React.CSSProperties}>
            Deep Cut is two things on one ticket. A recommendation engine that deals you{" "}
            <strong>movies you haven&apos;t seen yet</strong>. And an indie streaming house where{" "}
            <strong>members vote on which original film gets made next</strong> &mdash; paid for by {share}% of
            every dollar the membership puts in.
          </p>
        </ProjectorHero>
      </header>

      {/* The marquee. Doubled so the loop has no seam; the copy is read once. */}
      <div className="lp-ticker">
        <div className="lp-ticker-track">
          {[0, 1].map((n) => (
            <p key={n} aria-hidden={n === 1}>
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

        {/* ══════════ REEL TWO — the double feature ══════════ */}
        <section id="feature" aria-labelledby="feature-title" className="lp-section">
          <div className="lp-wrap">
            <div className="lp-double-head">
              <div>
                <Slate reel="Reel 02">The double feature</Slate>
                <h2 id="feature-title" className="lp-h2" data-reveal>
                  Two pictures. <span className="lp-serif">One ticket.</span>
                </h2>
              </div>
              <p className="lp-lede" data-reveal="rise">
                Most places do one of these. Deep Cut does both, on purpose. The first finds you the films
                worth your night. <strong>The second makes sure more of them get made.</strong>
              </p>
            </div>

            <div className="lp-bills">
              <p className="lp-plus" aria-hidden>
                <span>
                  PLUS!
                  <small>2nd big feature</small>
                </span>
              </p>

              {/* ── Feature one: the recommendation engine ── */}
              <article id="deal" className="lp-onesheet" data-reveal="rise">
                <div className="lp-onesheet-art">
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
                  <p className="lp-onesheet-tag">
                    <span>Feature one</span>
                    <span>The recommendation engine</span>
                  </p>
                  <p className="lp-onesheet-name">The Deal</p>
                  <h3 className="lp-onesheet-title">Movies you haven&apos;t seen yet</h3>
                </div>
                <div className="lp-onesheet-body">
                  <p>
                    Mark the films you love. Deep Cut reads them back as <strong>taste threads</strong> &mdash;
                    your taste, in plain English &mdash; then deals you deep cuts you&apos;ve never met. Every
                    card comes with a one-line reason it&apos;s yours, on the services you already pay for.
                  </p>
                  <div className="lp-onesheet-demo">
                    <DealDemo />
                  </div>
                  <ul className="lp-points">
                    <li>
                      <span>
                        <b>The obscurity dial.</b> Crowd-pleasers at one end, buried treasure at the other. You
                        decide how far off the map tonight goes.
                      </span>
                    </li>
                    <li>
                      <span>
                        <b>Settle It.</b> Two people, one couch, a quiz. The house rules on what you&apos;re
                        watching.
                      </span>
                    </li>
                    <li>
                      <span>
                        <b>Just Roll It.</b> A lean-back channel of deep-cut trailers that rolls until one
                        grabs you.
                      </span>
                    </li>
                    <li>
                      <span>
                        <b>Mixtapes and hot takes.</b> Movie playlists to hand a friend, and a wall to argue
                        on.
                      </span>
                    </li>
                  </ul>
                  <div className="lp-onesheet-foot">
                    <a href={joinHref} className="lp-btn lp-btn--amber">
                      {doorOpen ? "Get dealt in" : "Get in line"} <span aria-hidden>↗</span>
                    </a>
                    <Link href="/roll" className="lp-link">
                      Browse the trailer channels
                    </Link>
                  </div>
                </div>
              </article>

              {/* ── Feature two: the indie streaming house ── */}
              <article id="greenlight" className="lp-onesheet lp-onesheet--green" data-reveal="rise" style={{ "--i": 1 } as React.CSSProperties}>
                <div className="lp-onesheet-art">
                  <p className="lp-onesheet-tag">
                    <span>Feature two</span>
                    <span>The indie streaming house</span>
                  </p>
                  <p className="lp-onesheet-name">The Greenlight</p>
                  <h3 className="lp-onesheet-title">You decide what gets made</h3>
                </div>
                <div className="lp-onesheet-body">
                  <p>
                    Deep Cut is also an independent streaming platform: {channels} channels of award-winning
                    short films, free, running all night. And it works like a studio run by its audience.{" "}
                    <strong>{share}% of every dollar members put in</strong> goes into a fund for an independent
                    filmmaker&apos;s feature.
                  </p>
                  <div className="lp-onesheet-demo">
                    <dl className="lp-stats">
                      <div>
                        <dt>{share}%</dt>
                        <dd>of every dollar goes to the fund</dd>
                      </div>
                      <div>
                        <dt>$1 = 1</dt>
                        <dd>a dollar in is a vote</dd>
                      </div>
                      <div>
                        <dt>{cap}</dt>
                        <dd>votes is the most one member holds</dd>
                      </div>
                    </dl>
                    {/* The perk people actually want, shown rather than listed. */}
                    <div className="lp-credit">
                      <p className="lp-credit-top">A Deep Cut Original</p>
                      <dl>
                        <div>
                          <dt>directed by</dt>
                          <dd>the filmmaker you voted for</dd>
                        </div>
                        <div>
                          <dt>financed by</dt>
                          <dd>the members</dd>
                        </div>
                        <div>
                          <dt>special thanks</dt>
                          <dd className="is-you">your name here</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                  <ul className="lp-points">
                    <li>
                      <span>
                        <b>Filmmakers pitch originals.</b> We read every one, and watch every director&apos;s
                        previous work.
                      </span>
                    </li>
                    <li>
                      <span>
                        <b>You vote with points.</b> Supporting the house earns them. Spend them on the film
                        you want to exist.
                      </span>
                    </li>
                    <li>
                      <span>
                        <b>The winner gets shot,</b> and premieres here as a Deep Cut Original.
                      </span>
                    </li>
                    <li>
                      <span>
                        <b>Backers go in the credits.</b> From $25, your name is on the picture.
                      </span>
                    </li>
                  </ul>
                  <div className="lp-onesheet-foot">
                    <Link href="/vote" className="lp-btn lp-btn--ticket">
                      See the ballot <span aria-hidden>↗</span>
                    </Link>
                    <Link href="/tv" className="lp-link">
                      Enter the Theatre
                    </Link>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ══════════ REEL THREE — how a film gets made ══════════ */}
        <section id="how" aria-labelledby="how-title" className="lp-section lp-how" style={{ scrollMarginTop: "3rem" }}>
          <div className="lp-wrap">
            <Slate reel="Reel 03">Follow the money</Slate>
            <h2 id="how-title" className="lp-h2" data-reveal>
              How a film <em>gets made</em> here
            </h2>
            <p className="lp-lede" data-reveal="rise">
              No studio, no algorithm, no room you can&apos;t get into. Your membership goes in one end and a
              feature comes out the other. Five frames, start to premiere.
            </p>

            <div className="lp-strip">
              <ol className="lp-frames">
                {[
                  {
                    big: "Free",
                    t: "Take a seat",
                    d: "Joining costs nothing. Supporting the house is optional, starts at a dollar, and is what earns you a say.",
                  },
                  {
                    big: `${share}%`,
                    t: "The pot fills",
                    d: `${share}% of every dollar goes straight into the Indie Film Fund. Nothing is commissioned until it clears ${goal}, because half a film is no film.`,
                  },
                  {
                    big: "Pitch",
                    t: "Filmmakers send films",
                    d: "A one-sheet, a deck, and something they've made. No fee, no agent. Every pitch gets read and every reel gets watched.",
                  },
                  {
                    big: "$1 = 1",
                    t: "You cast your points",
                    d: "A dollar in is a point, and a point is a vote. Put them all behind one pitch, or split them across the slate.",
                  },
                  {
                    big: "Action",
                    t: "It gets shot",
                    d: "Most votes takes the money. The film shoots, then premieres here as a Deep Cut Original, with its backers in the credits.",
                  },
                ].map((f, i) => (
                  <li key={f.t} className="lp-frame" data-reveal="rise" style={{ "--i": i } as React.CSSProperties}>
                    <p className="lp-frame-no">
                      <span>Frame 0{i + 1}</span>
                      <span aria-hidden>DC·{24 + i}A ▸</span>
                    </p>
                    <p className="lp-frame-big">{f.big}</p>
                    <h3>{f.t}</h3>
                    <p className="lp-frame-desc">{f.d}</p>
                  </li>
                ))}
              </ol>
            </div>

            <div className="lp-how-foot">
              <div className="lp-how-fund">
                <FundBar />
              </div>
              <p className="lp-smallprint">
                <strong>The honest small print.</strong> Supporting the house gets you a vote, a credit and the
                perks. It isn&apos;t an investment, carries no financial return, and no vote has a cash value.
                Votes are capped at {cap} a person so nobody buys the room.{" "}
                <Link href="/fund" className="lp-link" style={{ whiteSpace: "nowrap" }}>
                  Read the whole thing
                </Link>
              </p>
            </div>
          </div>
        </section>

        {/* ══════════ The ballot ══════════ */}
        <section aria-labelledby="ballot-title" className="lp-section">
          <div className="lp-wrap lp-ballot">
            <div className="lp-ballot-copy">
              <Slate reel="Reel 03 · Scene 2">The ballot</Slate>
              <h2 id="ballot-title" className="lp-h2" data-reveal>
                A dollar is a vote. <span className="lp-serif">That&apos;s the whole rule.</span>
              </h2>
              <p className="lp-lede" data-reveal="rise">
                Your votes are a budget. Go all in on the one you&apos;d fight for, or split them across three.
                Splitting says which you&apos;d take if your first choice loses.
              </p>
              <ul className="lp-rules">
                <li>
                  <b>$1</b>
                  <span>
                    <strong>One dollar, one point, one vote.</strong> Put in $40 and you hold 40 votes.
                  </span>
                </li>
                <li>
                  <b>{cap}</b>
                  <span>
                    <strong>The cap.</strong> Nobody holds more than {cap}. Past that you&apos;re earning
                    credits and access, not influence &mdash; the richest person in the room doesn&apos;t pick
                    the movie.
                  </span>
                </li>
                <li>
                  <b>Read</b>
                  <span>
                    <strong>A real slate.</strong> Every pitch on the ballot has been read and every
                    director&apos;s previous work watched. You&apos;re not voting on a logline.
                  </span>
                </li>
              </ul>
            </div>
            <div data-reveal="rise">
              <div className="lp-ballot-demo">
                <BallotDemo />
                <p className="lp-ballot-demo-note">
                  A practice run with invented films. Nothing here counts.{" "}
                  <Link href="/vote" className="lp-link">
                    See the real ballot
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════ REEL FOUR — the screening room ══════════ */}
        <section id="theatre" aria-labelledby="theatre-title" className="lp-section lp-room">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="lp-room-photo" src="/scene/room.jpg?v=3" alt="" loading="lazy" decoding="async" />
          <div className="lp-wrap">
            <div className="lp-room-head">
              <Slate reel="Reel 04">Now showing · the Deep Cut Theatre</Slate>
              <h2 id="theatre-title" className="lp-h2" data-reveal>
                {channels} channels. <em>All night.</em> All free.
              </h2>
              <p className="lp-lede" data-reveal="rise">
                The streaming half. Award-winning short films off the festival circuit, programmed by hand onto
                channels with opinions, with a new bill every month. Pick one and pull up a beanbag.
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
                The films the numbers miss: artists&apos; favorite artists, directors&apos; favorite directors.
                The bar is whether a rep theater would put it on a midnight double bill. Tap a poster.
              </p>
            </div>
            <Suspense fallback={<p className="lp-room-note">Pulling the house picks…</p>}>
              <FeaturedReel />
            </Suspense>
          </div>
        </section>

        {/* ══════════ REEL FIVE — director's statement ══════════ */}
        <section id="founder" aria-labelledby="founder-title" className="lp-section lp-founder">
          <div className="lp-wrap lp-founder-grid">
            <div className="lp-founder-copy">
              <Slate reel="Reel 05">Director&apos;s statement</Slate>
              <h2 id="founder-title" className="lp-h2" data-reveal>
                Made by a filmmaker. <span className="lp-serif">For people who stay through the credits.</span>
              </h2>
              <blockquote className="lp-pull" data-reveal="rise">
                &ldquo;I wanted that feeling back.&rdquo;
                <cite>Griffin Howes · founder · ten years working in film</cite>
              </blockquote>
            </div>
            <div className="lp-paper" data-reveal="rise">
              <p className="lp-paper-head">
                <b>Director&apos;s statement</b>
                <span>Deep Cut · press kit · p. 1</span>
              </p>
              <FounderNote />
            </div>
          </div>
        </section>

        {/* ══════════ REEL SIX — two doors ══════════ */}
        <section id="filmmakers" aria-labelledby="doors-title" className="lp-section lp-section--line">
          <div className="lp-wrap">
            <Slate reel="Reel 06">Pick your door</Slate>
            <h2 id="doors-title" className="lp-h2" data-reveal>
              For the people who watch them. <em>And the people who make them.</em>
            </h2>

            <div className="lp-doors">
              <article className="lp-door" data-reveal="rise">
                <p className="lp-door-for">If you watch them</p>
                <h3>You&apos;ve seen the top row of every app.</h3>
                <p className="lp-door-desc">
                  You want the one a friend with unbearable taste would press into your hands. Deep Cut is that
                  friend, with a streaming service attached and a vote on what gets made next.
                </p>
                <ul>
                  <li>Recommendations with a reason on every card</li>
                  <li>{channels} channels of shorts the big apps don&apos;t carry</li>
                  <li>A say in the next Deep Cut Original</li>
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
                <p className="lp-door-desc">
                  Getting a first feature financed is absurd, and that is the whole reason the fund exists.
                  Send a one-sheet, a deck, and something you&apos;ve made. The people voting are the ones who
                  actually watch this stuff, which is a better room than most festivals put you in front of.
                </p>
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
              <p className="lp-lede" data-reveal="rise">
                The questions a sensible person asks before giving a film fund their email, let alone a dollar.
              </p>
              <p style={{ marginTop: "1.5rem" }}>
                <Link href="/fund" className="lp-link">
                  The fund, end to end
                </Link>
              </p>
            </div>
            <div className="lp-faq" data-reveal="rise">
              <details open>
                <summary>Is it free?</summary>
                <p>
                  Yes. It&apos;s free to use once you&apos;re in. A platform like this costs money to run, so if
                  you feel like chipping in, you can &mdash; supporting the house unlocks the full app and earns
                  you votes on the next film.
                </p>
              </details>
              <details>
                <summary>Am I investing in a movie?</summary>
                <p>
                  No. Supporting the house buys you a vote, a credit and the perks. It isn&apos;t an investment,
                  carries no financial return, and no vote has a cash value.
                </p>
              </details>
              <details>
                <summary>What stops the richest person picking the film?</summary>
                <p>
                  The cap. Votes top out at {cap} per person. Give as much as you like &mdash; it all counts
                  toward the goal and toward your perks &mdash; but past the cap you&apos;re buying credits and
                  access, not influence.
                </p>
              </details>
              <details>
                <summary>Who decides what reaches the ballot?</summary>
                <p>
                  We do. Anything on the ballot has been read, and the director&apos;s previous work has been
                  watched. Members choose between films that can actually be made, rather than sifting an open
                  submissions pile.
                </p>
              </details>
              <details>
                <summary>What if the fund never fills?</summary>
                <p>
                  Then nothing gets commissioned and the fund keeps growing. What you paid for is a membership
                  &mdash; the Theatre, the recommendations, the whole house. Nothing is held in escrow against a
                  film that might not happen.
                </p>
              </details>
              <details>
                <summary>I make films. How do I pitch?</summary>
                <p>
                  Send a one-sheet, a deck, and something you&apos;ve made. There&apos;s no fee, and nobody has
                  to introduce you.{" "}
                  <Link href="/submit" className="lp-link">
                    Submit your film
                  </Link>
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
          <p className="lp-lede" data-reveal="rise">
            Find the films you&apos;ve never seen. Help make the ones that don&apos;t exist yet.
          </p>
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
          </div>
        </div>
      </section>

      {/* ══════════ End credits ══════════ */}
      <footer className="lp-credits">
        <div className="lp-wrap">
          <p className="lp-billing">
            <small>Deep Cut presents</small> <b>a picture house for people who love movies</b>{" "}
            <small>programmed by</small> <b>the house</b> <small>greenlit by</small> <b>the members</b>{" "}
            <small>founded by</small> <b>Griffin Howes</b> <small>running time</small> <b>all night</b>
          </p>
          <p className="lp-credits-logo">
            DEEP CUT<span className="lp-ticket">.</span>
          </p>
          <p className="lp-mono" style={{ marginTop: "0.6rem", color: "var(--color-dim)" }}>
            For the films you haven&apos;t met yet.
          </p>
          <nav aria-label="Footer" className="lp-credits-nav">
            <Link href="/tv">The Theatre</Link>
            <Link href="/fund">The Fund</Link>
            <Link href="/vote">The Ballot</Link>
            <Link href="/submit">Submit a film</Link>
            <Link href="/login">Sign in</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </nav>
          <p className="lp-credits-legal">
            Metadata &amp; streaming data: TMDB (JustWatch). Not endorsed or certified by TMDB.
          </p>
        </div>
      </footer>
    </main>
  );
}
