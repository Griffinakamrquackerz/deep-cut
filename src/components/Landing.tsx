import Link from "next/link";
import MarqueeBulbs from "@/components/MarqueeBulbs";

/**
 * Signed-out front door. Sells the fantasy before the login wall:
 * poster wall, the pitch, how it works, a sample taste card.
 */
export default function Landing({ posters }: { posters: string[] }) {
  return (
    <main className="relative min-h-dvh overflow-hidden">
      {/* ── Tilted poster wall behind the hero ─────────────────────── */}
      {posters.length >= 6 && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[30rem] overflow-hidden">
          <div className="absolute -inset-x-10 -top-8 grid rotate-[-4deg] grid-cols-4 gap-3 opacity-25 sm:grid-cols-6">
            {posters.slice(0, 12).map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${p}-${i}`}
                src={`https://image.tmdb.org/t/p/w342${p}`}
                alt=""
                loading={i < 6 ? "eager" : "lazy"}
                decoding="async"
                className="aspect-[2/3] w-full rounded object-cover"
              />
            ))}
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-bg/40 via-bg/75 to-bg" />
        </div>
      )}

      <div className="relative z-10 mx-auto flex max-w-md flex-col gap-10 px-5 pb-16 pt-14 sm:max-w-lg md:max-w-2xl">
        {/* ── Hero ────────────────────────────────────────────────── */}
        <header className="pt-24 text-center">
          <MarqueeBulbs />
          <p className="eyebrow mt-4">Deep Cut · Admit One</p>
          <h1 className="neon-flicker mt-1 font-display text-6xl leading-[0.9] text-amber">
            MOVIES YOU
            <br />
            HAVEN&apos;T MET YET
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-base leading-relaxed text-cream/90">
            An AI ticket-dealer reads the films you love, names the taste threads you didn&apos;t
            know you had, and deals you tonight&apos;s picks — deep cuts included, algorithm
            slop excluded.
          </p>
          <div className="mt-6 flex flex-col items-center gap-3">
            <Link
              href="/login"
              className="pulse-cta w-full max-w-xs rounded bg-ticket px-6 py-4 text-center font-mono text-sm font-medium uppercase tracking-[0.25em] text-cream"
            >
              🎟 Get your ticket
            </Link>
            <p className="font-mono text-[0.65rem] uppercase tracking-widest text-dim">
              Free · runs on your phone · 2-minute setup
            </p>
          </div>
        </header>

        {/* ── How it works ────────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <p className="eyebrow text-center">How the picture starts</p>
          {[
            {
              n: "01",
              title: "RIP YOUR TICKET",
              line: "Pick films you love — any genre, any era. Guilty pleasures teach us more than classics do.",
            },
            {
              n: "02",
              title: "MEET THE DEALER",
              line: "The engine names your taste threads, then deals films matched to them. Turn the obscurity dial from crowd-pleasers to buried treasure.",
            },
            {
              n: "03",
              title: "PASS THE MIXTAPE",
              line: "Seal a playlist and send it to a friend — they cross films off and react, no account needed to peek.",
            },
          ].map((s) => (
            <div key={s.n} className="film-card flex gap-4 rounded-lg p-4">
              <span className="font-display text-4xl text-ticket">{s.n}</span>
              <div>
                <p className="font-display text-2xl leading-tight text-cream">{s.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-dim">{s.line}</p>
              </div>
            </div>
          ))}
        </section>

        {/* ── Sample taste card ───────────────────────────────────── */}
        <section>
          <p className="eyebrow mb-2 text-center">Your taste, in writing</p>
          <div className="ticket-edge rounded bg-surface p-5">
            <p className="font-mono text-[0.6rem] uppercase tracking-widest text-dim">
              Taste profile · №0417
            </p>
            <ul className="mt-3 flex flex-col gap-3">
              <li>
                <p className="font-mono text-xs uppercase tracking-widest text-ticket">
                  Beautiful Doom
                </p>
                <p className="mt-0.5 text-sm text-cream">
                  You love watching power structures implode in flamboyant, violent, gorgeous
                  ways.
                </p>
              </li>
              <li>
                <p className="font-mono text-xs uppercase tracking-widest text-ticket">
                  Midnight Logic
                </p>
                <p className="mt-0.5 text-sm text-cream">
                  Dream rules over plot rules — you&apos;d rather feel lost than be led.
                </p>
              </li>
              <li>
                <p className="font-mono text-xs uppercase tracking-widest text-ticket">
                  Crooks With Feelings
                </p>
                <p className="mt-0.5 text-sm text-cream">
                  Crime is your delivery system for loyalty, grief, and very bad decisions.
                </p>
              </li>
            </ul>
            <p className="mt-4 border-t border-line pt-3 text-center font-mono text-[0.6rem] uppercase tracking-widest text-dim">
              Every profile is written fresh — nobody gets yours
            </p>
          </div>
        </section>

        {/* ── Feature stamps ──────────────────────────────────────── */}
        <section className="grid grid-cols-2 gap-3 text-center">
          {[
            { g: "◆◆◆◆◆", t: "Obscurity dial", d: "from blockbusters to buried treasure" },
            { g: "🎭", t: "Tonight's vibe", d: "scare me · make me laugh · get weird" },
            { g: "📼", t: "Letterboxd import", d: "bring your ratings, skip the setup" },
            { g: "🍿", t: "The community", d: "follow friends, steal their watches" },
          ].map((f) => (
            <div key={f.t} className="rounded border border-line bg-surface p-4">
              <p className="text-lg text-amber">{f.g}</p>
              <p className="mt-1 font-display text-lg text-cream">{f.t}</p>
              <p className="font-mono text-[0.6rem] leading-relaxed text-dim">{f.d}</p>
            </div>
          ))}
        </section>

        {/* ── Final CTA ───────────────────────────────────────────── */}
        <section className="text-center">
          <p className="font-display text-3xl text-cream">THE HOUSE LIGHTS ARE DOWN.</p>
          <Link
            href="/login"
            className="pulse-cta mt-4 inline-block w-full max-w-xs rounded bg-ticket px-6 py-4 font-mono text-sm font-medium uppercase tracking-[0.25em] text-cream"
          >
            ★ Take your seat ★
          </Link>
        </section>

        <footer className="border-t border-line pt-4 text-center">
          <p className="font-mono text-[0.55rem] leading-relaxed text-dim/70">
            Metadata & streaming data: TMDB (JustWatch). This product uses the TMDB API but is
            not endorsed or certified by TMDB.
          </p>
        </footer>
      </div>
    </main>
  );
}
