import Link from "next/link";
import MarqueeBulbs from "@/components/MarqueeBulbs";

export default function Landing({ posters }: { posters: string[] }) {
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

        <header className="pb-14 pt-14 text-center sm:pb-20 sm:pt-20">
          <MarqueeBulbs />
          <p className="eyebrow mt-6 text-amber">An independent cinema for the curious</p>
          <h1 className="glow-amber mt-4 font-display text-[clamp(2.6rem,11vw,4.5rem)] leading-[0.9] text-amber">
            YOUR NEXT
            <br />
            FAVORITE FILM
            <br />
            <span className="text-cream">IS OUT THERE.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-md text-lg leading-relaxed text-cream/90">
            Watch independent short films. Find hidden gems. Fall in love with movies all over again.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/login" className="w-full rounded-sm bg-ticket px-6 py-4 font-mono text-xs font-medium uppercase tracking-[0.15em] text-cream transition-colors hover:bg-[#f06a50] sm:w-auto">
              Find your next film <span aria-hidden>↗</span>
            </Link>
            <a href="#program" className="w-full rounded-sm border border-cream/30 bg-bg/50 px-6 py-4 font-mono text-xs uppercase tracking-[0.15em] text-cream transition-colors hover:border-amber sm:w-auto">
              Explore the program <span aria-hidden>↓</span>
            </a>
          </div>
          <p className="mt-5 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-dim">
            Independent cinema · Made for movie lovers
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
          <p className="mt-4 text-sm text-dim">Three acts. Pick a scene to learn more.</p>

          <div className="mt-5 flex flex-col gap-3">
            <details className="landing-act group">
              <summary className="landing-act-summary">
                <span className="landing-act-number">01</span>
                <span className="min-w-0 flex-1">
                  <span className="landing-act-kicker">The screening room</span>
                  <span className="landing-act-title">WATCH INDEPENDENT FILM</span>
                  <span className="landing-act-teaser">Short films worth staying up for.</span>
                </span>
                <span aria-hidden className="landing-act-toggle">+</span>
              </summary>
              <div className="landing-act-body">
                <p>Deep Cut is an independent streaming platform with free channels of short films, made for the joy of stumbling onto something extraordinary.</p>
              </div>
            </details>

            <details className="landing-act group">
              <summary className="landing-act-summary">
                <span className="landing-act-number">02</span>
                <span className="min-w-0 flex-1">
                  <span className="landing-act-kicker">The video store</span>
                  <span className="landing-act-title">FIND YOUR HIDDEN GEMS</span>
                  <span className="landing-act-teaser">Less scrolling. More “how have I never seen this?”</span>
                </span>
                <span aria-hidden className="landing-act-toggle">+</span>
              </summary>
              <div className="landing-act-body">
                <p>Tell us the films you love and we&apos;ll find movies that fit your taste, from familiar favorites to the beautiful stuff hiding off the beaten path.</p>
                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3">
                  <Link href="/login" className="landing-text-link">Get personalized picks <span aria-hidden>↗</span></Link>
                  <Link href="/roll" className="landing-text-link">Browse trailer channels <span aria-hidden>↗</span></Link>
                </div>
              </div>
            </details>

            <details className="landing-act group">
              <summary className="landing-act-summary">
                <span className="landing-act-number">03</span>
                <span className="min-w-0 flex-1">
                  <span className="landing-act-kicker">The people behind the picture</span>
                  <span className="landing-act-title">BUILT FOR FILM LOVERS</span>
                  <span className="landing-act-teaser">Independent cinema, supported by its community.</span>
                </span>
                <span aria-hidden className="landing-act-toggle">+</span>
              </summary>
              <div className="landing-act-body">
                <p>Deep Cut is powered by people who believe great films deserve to be found. It&apos;s our love letter to the video-store discovery: taking a chance on something new and finding a favorite.</p>
              </div>
            </details>
          </div>
        </section>

        <section className="my-16 border-y border-cream/15 py-10 text-center">
          <p className="eyebrow text-ticket">The lights are going down</p>
          <h2 className="mt-3 font-display text-4xl leading-none text-cream sm:text-5xl">COME FIND YOUR NEXT OBSESSION.</h2>
          <Link href="/login" className="mt-6 inline-block rounded-sm bg-amber px-7 py-4 font-mono text-xs font-medium uppercase tracking-[0.15em] text-bg transition-colors hover:bg-cream">
            Find your next film <span aria-hidden>↗</span>
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
