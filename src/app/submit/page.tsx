import type { Metadata } from "next";
import Link from "next/link";
import SubmitPitch from "@/components/SubmitPitch";
import MarqueeBulbs from "@/components/MarqueeBulbs";
import { showcaseSlots } from "@/lib/submissions";
import { fundProgress, goalCents } from "@/lib/fund";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Where filmmakers hand in a pitch.
//
// The Fund page has promised "no agent, no connections, no pay-to-play
// submission fee" since it shipped, with nowhere to act on it. This is the page
// that makes that sentence true, so it is deliberately open: no account, no
// fee, no gatekeeping beyond somebody actually reading the thing.

export const metadata: Metadata = {
  title: "Submit your film — Deep Cut",
  description:
    "This is for any independent filmmaker who wants to see their project through. There's no fee. Send us a logline, a synopsis and your previous work — we read all of it.",
};

// Live, not static: the honest-timing block below reads the real ledger, and a
// cached "$0 of $250,000" would eventually become a lie in the direction that
// costs a filmmaker their evening.
export const dynamic = "force-dynamic";

export default async function SubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  // The app opens this page in the system browser with ?from=app, and when it
  // does the /fund link at the bottom is dropped.
  //
  // /fund renders the skip-the-line widget, which reaches Stripe. Supporting
  // the fund unlocks in-app features, so a path from inside the app to that
  // checkout is what Guideline 3.1.1 is about. The app already leaves to the
  // system browser rather than an in-app sheet; removing the onward link as
  // well means the path simply isn't there.
  //
  // Everyone arriving any other way — from search, from a share, from the
  // site itself — still gets the link, because for them it's just a page
  // explaining how the money works.
  const fromApp = (await searchParams).from === "app";
  const slots = showcaseSlots();
  const goal = `$${(goalCents() / 100).toLocaleString("en-US")}`;

  // Where the fund actually stands. Null when the ledger can't be read, which
  // shows the honest block without numbers rather than inventing a zero.
  const fund = await fundProgress(supabaseAdmin()).catch(() => null);
  const raised = fund ? `$${Math.floor(fund.raisedCents / 100).toLocaleString("en-US")}` : null;

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-8">
      <div className="flex flex-col gap-8">
        <header className="text-center">
          <MarqueeBulbs />
          <p className="eyebrow mt-3">Open submissions</p>
          <h1 className="glow-amber mt-1 font-display text-5xl leading-[0.92] text-amber">
            SEND US
            <br />
            YOUR FILM
          </h1>
          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-cream/90">
            Deep Cut was built by a filmmaker, and the reason the fund exists is
            that getting a first feature financed is absurd. If you have a script
            and a reel, you can pitch.{" "}
            <span className="text-amber">There's no fee, and nobody has to introduce you.</span>
          </p>
        </header>

        {/* How it actually goes, stated before they spend twenty minutes on the
            form. The odds are not flattering and saying so is the point — a
            director deciding whether to submit deserves the real shape of it. */}
        <section className="rounded-lg border border-line bg-surface p-4">
          <p className="eyebrow mb-2 text-ticket">What happens to it</p>
          <ol className="flex flex-col gap-2.5 text-[0.9rem] leading-relaxed text-cream/90">
            <li className="flex gap-3">
              <span className="font-mono text-[0.6rem] text-ticket">01</span>
              <span>
                Somebody here reads the whole thing and watches your previous
                work. That takes a while, and we&apos;d rather be slow than skim
                it.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-[0.6rem] text-ticket">02</span>
              <span>
                We pick <span className="text-amber">{slots} films</span> to put
                on the ballot. That number is small on purpose: a ballot nobody
                can read in one sitting gets skimmed, and a skimmed ballot is won
                by whatever summarises best.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-[0.6rem] text-ticket">03</span>
              <span>
                Members vote on those {slots}. The one with the most votes gets
                financed — {goal} and up — and premieres here as a Deep Cut
                Original.
              </span>
            </li>
          </ol>
          <p className="mt-3 border-t border-line pt-2.5 font-mono text-[0.65rem] leading-relaxed text-dim">
            You&apos;ll hear back either way. A pass is still an answer, and never
            hearing anything is the thing everyone hates about submitting.
          </p>
        </section>

        {/* ── How long this actually takes ────────────────────────────
            The real numbers, before somebody spends an evening on the form
            rather than after. A filmmaker told the honest odds can decide for
            themselves; one left to assume it's imminent has been misled by
            omission, and this is a small community with a long memory for
            that. */}
        <section className="rounded-lg border border-ticket/40 bg-ticket/5 p-4">
          <p className="eyebrow text-ticket">Before you spend an evening on this</p>
          <p className="mt-1.5 text-sm leading-relaxed text-cream">
            {raised ? (
              <>
                The fund holds <span className="text-amber">{raised}</span> of {goal}{" "}
                right now. Nothing gets commissioned until it clears that.
              </>
            ) : (
              <>
                The fund is still filling, and nothing gets commissioned until it
                clears {goal}.
              </>
            )}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-cream">
            So: we read everything as it arrives, and if yours makes the slate
            you&apos;ll know. But{" "}
            <span className="text-amber">
              the film doesn&apos;t get made until the fund fills
            </span>
            , and that could be a long wait. We&apos;d rather you knew that now
            than after.
          </p>
          <p className="mt-2 text-[0.85rem] leading-relaxed text-dim">
            Nothing here is exclusive and nothing is held. Take your film
            anywhere else in the meantime — if it gets made elsewhere first,
            that&apos;s a good outcome and we&apos;ll be pleased for you.
          </p>
        </section>

        <SubmitPitch slots={slots} />

        {!fromApp && (
          <section className="text-center">
            <Link href="/fund" className="font-mono text-[0.65rem] uppercase tracking-[0.15em] text-amber">
              How the money and the voting work →
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}
