import Link from "next/link";
import MarqueeBulbs from "@/components/MarqueeBulbs";
import WaitlistForm from "@/components/WaitlistForm";
import FundBar from "@/components/FundBar";
import FounderNote from "@/components/FounderNote";

/**
 * Signed-out front door — now a velvet rope. Sells the fantasy (poster wall,
 * the pitch, how it works, a sample taste card), then takes an email for the
 * waitlist instead of open signup. A daily trickle seats the next row, which
 * keeps signup email volume under the free tier AND makes the door part of
 * the show. Members still slip in via the "have a ticket?" link.
 */
/**
 * `open` is the live answer from Supabase Auth, not a constant — see
 * lib/signups.ts. The front door has three places that assert invite-only, and
 * they used to be three hard-coded sentences that a dashboard toggle could
 * silently make false. Passing the real setting in means the day the rope comes
 * down the page stops promising a queue, without anybody remembering to ship a
 * copy change. null (couldn't ask) is treated as closed on purpose: describing
 * a door as open when it isn't sends people into a signup form that rejects
 * them, which is the worse of the two mistakes.
 */
export default function Landing({
  posters,
  open = false,
}: {
  posters: string[];
  open?: boolean | null;
}) {
  const doorOpen = open === true;
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
          <p className="eyebrow mt-4">
            Deep Cut · {doorOpen ? "Now open" : "Invite only"} · Admit One
          </p>
          <h1 className="neon-flicker mt-1 font-display text-6xl leading-[0.9] text-amber">
            I THOUGHT I&apos;D
            <br />
            SEEN THEM ALL
          </h1>

          <FounderNote />

          <div className="mt-6 flex flex-col items-center gap-3">
            {doorOpen ? (
              <Link
                href="/login?mode=signup"
                className="w-full max-w-xs rounded bg-amber py-3.5 text-center font-mono text-sm font-medium uppercase tracking-[0.2em] text-bg"
              >
                Take a seat
              </Link>
            ) : (
              <WaitlistForm />
            )}
            <p className="font-mono text-[0.65rem] uppercase tracking-widest text-dim">
              Free to join · support if you want to · cancel any time
            </p>
            <Link
              href="/login"
              className="font-mono text-[0.65rem] uppercase tracking-widest text-dim underline"
            >
              Already have a ticket? Slip in →
            </Link>
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
              line: "The house works out what you're actually into and deals films to match, filtered to the services you already pay for. Turn the obscurity dial from crowd-pleasers to buried treasure.",
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

        {/* ── The Fund ─────────────────────────────────────────────
            The reason to care beyond a recommendation engine, and the reason
            somebody would pay for something whose free tier is generous. Kept
            factual: a share of what members put in, a threshold, a vote, a
            credit. No
            promise of a return, because there isn't one and implying one would
            turn a membership into a security. Everything here links onward to
            /fund, which is where the whole thing is actually explained. */}
        <section className="flex flex-col gap-3">
          <p className="eyebrow text-center">What your ticket actually does</p>
          <FundBar />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              {
                n: "01",
                t: "The fund fills",
                d: "60% of everything members put in goes into the film fund. A dollar earns a vote.",
              },
              {
                // The middle step used to be "backers greenlight", which gave
                // away the strongest thing about this and replaced it with the
                // weakest. Crowds pick what pitches well; a read slate doesn't
                // have that problem. Curation is the promise — say it out loud.
                n: "02",
                t: "We read every pitch",
                d: "Scripts and reels come in from anyone. We read them and watch them. Only films that can actually be made reach the ballot.",
              },
              {
                n: "03",
                t: "The house picks one",
                d: "You spend your votes across the slate. Most votes takes the money, a real crew shoots it, and it premieres here.",
              },
            ].map((s2) => (
              <div key={s2.n} className="rounded border border-line bg-surface p-3">
                <p className="font-mono text-[0.6rem] tracking-widest text-ticket">{s2.n}</p>
                <p className="mt-0.5 font-display text-xl leading-tight text-cream">{s2.t}</p>
                <p className="mt-1 text-xs leading-relaxed text-dim">{s2.d}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              href="/fund"
              className="rounded border border-amber px-5 py-2.5 text-center font-mono text-[0.65rem] uppercase tracking-widest text-amber"
            >
              The tiers and the breakdown →
            </Link>
            <Link
              href="/vote"
              className="rounded border border-line px-5 py-2.5 text-center font-mono text-[0.65rem] uppercase tracking-widest text-cream"
            >
              Read the pitches →
            </Link>
          </div>
          <p className="text-center font-mono text-[0.55rem] leading-relaxed text-dim/70">
            Votes decide what we greenlight. They aren&apos;t an investment and carry
            no financial return.
          </p>
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
            {
              g: "📡",
              t: "Only what you can watch",
              d: "filtered to your services — every pick is one click away",
            },
            {
              g: "🎬",
              t: "The Theatre",
              d: "fourteen channels of award-winning shorts, free, all night",
            },
            { g: "◆◆◆◆◆", t: "Obscurity dial", d: "from blockbusters to buried treasure" },
            { g: "🎭", t: "Tonight's vibe", d: "scare me · make me laugh · get weird" },
            { g: "⚖️", t: "Settle It", d: "two films enter, the house rules — argument over" },
            { g: "📺", t: "Just Roll It", d: "pick a channel, lean back, we run the reel" },
            { g: "🎵", t: "Profiles with a theme song", d: "your signature film's score plays on your card" },
            { g: "🔥", t: "Hot takes wall", d: "250 characters of nitrate-burning opinion" },
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
          <p className="font-display text-3xl text-cream">
            {doorOpen ? "THE HOUSE IS OPEN." : "THE HOUSE IS NEARLY FULL."}
          </p>
          <p className="mx-auto mt-1 max-w-xs font-mono text-[0.65rem] uppercase tracking-widest text-dim">
            {doorOpen
              ? "Doors are open and the picture starts when you do."
              : "We seat a new row every day — get in line and your ticket lands by email."}
          </p>
          <div className="mt-4">
            {doorOpen ? (
              <Link
                href="/login?mode=signup"
                className="inline-block rounded border border-amber px-6 py-3 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-amber"
              >
                Take a seat
              </Link>
            ) : (
              <WaitlistForm compact />
            )}
          </div>
        </section>

        <footer className="border-t border-line pt-4 text-center">
          <p className="font-mono text-[0.55rem] leading-relaxed text-dim/70">
            Metadata & streaming data: TMDB (JustWatch). This product uses the TMDB API but is
            not endorsed or certified by TMDB.
          </p>
          <p className="mt-2 font-mono text-[0.6rem] text-dim/80">
            <Link href="/terms" className="underline">Terms</Link> ·{" "}
            <Link href="/privacy" className="underline">Privacy</Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
