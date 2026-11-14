import Link from "next/link";
import { Suspense } from "react";
import MarqueeBulbs from "@/components/MarqueeBulbs";
import FeaturedReel from "@/components/FeaturedReel";
import WaitlistForm from "@/components/WaitlistForm";
import FundBar from "@/components/FundBar";
import FounderNote from "@/components/FounderNote";
import { sharePct } from "@/lib/fund";
import { CHANNELS } from "@/lib/shorts";

function ProgramArt({ scene }: { scene: "screen" | "discover" | "community" }) {
  return (
    <span className={`landing-art landing-art--${scene}`} aria-hidden="true">
      {scene === "screen" ? (
        <>
          <span className="landing-art-small">Now showing</span>
          <span className="landing-art-display">AFTER<br />DARK</span>
          <span className="landing-art-small">Picture show</span>
        </>
      ) : scene === "discover" ? (
        <>
          <span className="landing-art-small">Deep Cut video</span>
          <span className="landing-art-display">STAFF<br />PICK</span>
          <span className="landing-art-small">Take a chance</span>
        </>
      ) : (
        <>
          <span className="landing-art-small">Admit one</span>
          <span className="landing-art-display">FILM<br />CLUB</span>
          <span className="landing-art-small">You belong here</span>
        </>
      )}
    </span>
  );
}

export default function Landing({ posters, open = false }: { posters: string[]; open?: boolean | null }) {
  const doorOpen = open === true;
  const joinHref = doorOpen ? "/login?mode=signup" : "#join";
  return (
    <main className="relative min-h-dvh overflow-hidden">
      {posters.length > 0 && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[38rem] overflow-hidden">
          <div className="absolute -inset-x-16 -top-8 grid rotate-[-6deg] grid-cols-3 gap-3 opacity-20 sm:grid-cols-4">
            {posters.slice(0, 12).map((poster, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${poster}-${i}`}
                src={`https://image.tmdb.org/t/p/w342${poster}`}
                alt=""
                loading={i < 4 ? "eager" : "lazy"}
                decoding="async"
                className="aspect-[2/3] w-full rounded-sm object-cover"
              />
            ))}
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-bg/50 via-bg/80 to-bg" />
        </div>
      )}

      <div className="relative mx-auto max-w-xl px-5 pb-12 sm:px-8">
        <nav aria-label="Main navigation" className="flex items-center justify-between border-b border-cream/15 py-5">
          <Link href="/" className="font-display text-2xl tracking-[0.08em] text-cream">
            DEEP CUT<span className="text-ticket">.</span>
          </Link>
          <Link href="/login" className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-cream/80 underline decoration-ticket underline-offset-4">
            Sign in
          </Link>
        </nav>

        <header id="join" className="scroll-mt-6 pb-14 pt-14 text-center sm:pb-20 sm:pt-20">
          <MarqueeBulbs />
          <p className="eyebrow mt-6 text-amber">Independent cinema · Community supported</p>
          <h1 className="glow-amber mt-4 font-display text-[clamp(2.6rem,11vw,4.5rem)] leading-[0.9] text-amber">
            WATCH DIFFERENT.
            <br />
            FIND YOUR NEXT
            <br />
            <span className="text-cream">FAVORITE.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-md text-lg leading-relaxed text-cream/90">
            Free short films and taste-matched hidden gems. Member contributions help fund independent features.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            {doorOpen ? (
              <Link href={joinHref} className="w-full max-w-xs rounded-sm bg-ticket px-6 py-4 font-mono text-xs font-medium uppercase tracking-[0.15em] text-cream transition-colors hover:bg-[#f06a50]">
                Get movie recommendations <span aria-hidden>↗</span>
              </Link>
            ) : (
              <WaitlistForm />
            )}
            <a href="#program" className="w-full rounded-sm border border-cream/30 bg-bg/50 px-6 py-4 font-mono text-xs uppercase tracking-[0.15em] text-cream transition-colors hover:border-amber sm:w-auto">
              Explore Deep Cut <span aria-hidden>↓</span>
            </a>
          </div>
          <p className="mt-5 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-dim">
            Independent films · Hidden gems · Film lovers
          </p>
        </header>

        <section id="program" aria-labelledby="program-title" className="scroll-mt-6">
          <div className="flex items-end justify-between border-b border-cream/20 pb-4">
            <div>
              <p className="eyebrow text-ticket">Now showing</p>
              <h2 id="program-title" className="mt-1 font-display text-4xl leading-none text-cream sm:text-5xl">
                THE DEEP CUT PROGRAM
              </h2>
            </div>
            <span className="hidden font-mono text-[0.6rem] uppercase tracking-widest text-dim sm:block">Choose your scene</span>
          </div>
          <p className="mt-4 text-sm text-dim">Tap a section to learn more.</p>

          <div className="mt-5 flex flex-col gap-3">
            <details className="landing-act landing-act--screen">
              <summary className="landing-act-summary">
                <span className="landing-act-number">01</span>
                <span className="landing-act-copy min-w-0 flex-1">
                  <span className="landing-act-kicker">The screening room</span>
                  <span className="landing-act-title">STREAM SHORT FILMS</span>
                  <span className="landing-act-teaser">{CHANNELS.length} channels of short films, free for members.</span>
                </span>
                <ProgramArt scene="screen" />
                <span aria-hidden className="landing-act-toggle">+</span>
              </summary>
              <div className="landing-act-body">
                <p>Watch award-winning short films in the Deep Cut Theatre. A free account is required to play films.</p>
                <Link href="/tv" className="landing-text-link mt-4 inline-block">Enter the theater <span aria-hidden>↗</span></Link>
              </div>
            </details>

            <details className="landing-act landing-act--discover">
              <summary className="landing-act-summary">
                <span className="landing-act-number">02</span>
                <span className="landing-act-copy min-w-0 flex-1">
                  <span className="landing-act-kicker">The video store</span>
                  <span className="landing-act-title">DISCOVER YOUR NEXT FILM</span>
                  <span className="landing-act-teaser">Recommendations based on the movies you love.</span>
                </span>
                <ProgramArt scene="discover" />
                <span aria-hidden className="landing-act-toggle">+</span>
              </summary>
              <div className="landing-act-body">
                <p>Choose films you love. Get recommendations matched to your taste, including hidden gems you might have missed.</p>
                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3">
                  <Link href={joinHref} className="landing-text-link">{doorOpen ? "Get personalized picks" : "Join the waitlist"} <span aria-hidden>↗</span></Link>
                  <Link href="/roll" className="landing-text-link">Browse trailer channels <span aria-hidden>↗</span></Link>
                </div>
              </div>
            </details>

            <details className="landing-act landing-act--community">
              <summary className="landing-act-summary">
                <span className="landing-act-number">03</span>
                <span className="landing-act-copy min-w-0 flex-1">
                  <span className="landing-act-kicker">The people behind the picture</span>
                  <span className="landing-act-title">HELP MAKE A FILM</span>
                  <span className="landing-act-teaser">Member support funds independent cinema.</span>
                </span>
                <ProgramArt scene="community" />
                <span aria-hidden className="landing-act-toggle">+</span>
              </summary>
              <div className="landing-act-body">
                <p>{sharePct()}% of member contributions goes toward financing an independent feature. We review pitches; members vote on which film gets made.</p>
                <div className="mt-4"><FundBar compact /></div>
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
                  <Link href="/fund" className="landing-text-link">Explore the film fund <span aria-hidden>↗</span></Link>
                  <Link href="/vote" className="landing-text-link">See the pitches <span aria-hidden>↗</span></Link>
                </div>
              </div>
            </details>
          </div>
        </section>

        <section aria-labelledby="featured-title" className="mt-16">
          <div className="flex items-end justify-between gap-4 border-b border-cream/20 pb-4">
            <div>
              <p className="eyebrow text-ticket">Hand-picked by the house</p>
              <h2 id="featured-title" className="mt-1 font-display text-4xl leading-none text-cream sm:text-5xl">
                THE HOUSE PICKS
              </h2>
            </div>
            <span aria-hidden className="font-mono text-lg text-amber">✳</span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-dim">
            Films from our hand-picked house canon. Swipe through and tap a poster for details.
          </p>
          <Suspense fallback={<p className="mt-5 text-sm text-dim">Loading the house picks…</p>}>
            <FeaturedReel />
          </Suspense>
          <Link href={joinHref} className="mt-6 inline-block border border-amber px-6 py-4 font-mono text-xs font-medium uppercase tracking-[0.12em] text-amber transition-colors hover:bg-amber hover:text-bg">
            {doorOpen ? "Find more deep cuts" : "Join the waitlist"} <span aria-hidden>↗</span>
          </Link>
        </section>

        <details className="mt-12 border-t border-line pt-5">
          <summary className="cursor-pointer font-mono text-xs uppercase tracking-wider text-amber">A note from the founder</summary>
          <FounderNote />
        </details>

        <section className="my-16 border-y border-cream/15 py-10 text-center">
          <p className="eyebrow text-ticket">Your next movie night</p>
          <h2 className="mt-3 font-display text-4xl leading-none text-cream sm:text-5xl">READY TO FIND MORE?</h2>
          <Link href={joinHref} className="mt-6 inline-block rounded-sm bg-amber px-7 py-4 font-mono text-xs font-medium uppercase tracking-[0.15em] text-bg transition-colors hover:bg-cream">
            {doorOpen ? "Get movie recommendations" : "Join the waitlist"} <span aria-hidden>↗</span>
          </Link>
        </section>

        <footer className="flex flex-col gap-4 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
          <div>
            <p className="font-display text-2xl tracking-wide text-cream">DEEP CUT<span className="text-ticket">.</span></p>
            <p className="mt-1 font-mono text-[0.6rem] leading-relaxed text-dim">For the films you haven&apos;t met yet.</p>
          </div>
          <div className="font-mono text-[0.6rem] leading-relaxed text-dim">
            <p><Link href="/terms" className="underline">Terms</Link> · <Link href="/privacy" className="underline">Privacy</Link></p>
            <p className="mt-2">Metadata &amp; streaming data: TMDB (JustWatch).<br />Not endorsed or certified by TMDB.</p>
          </div>
        </footer>
      </div>
    </main>
  );
}
