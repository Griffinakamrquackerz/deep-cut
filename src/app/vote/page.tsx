import type { Metadata } from "next";
import Link from "next/link";
import Ballot from "@/components/Ballot";
import MarqueeBulbs from "@/components/MarqueeBulbs";

// The greenlight ballot.
//
// Public and unauthenticated on purpose, the same as /fund. Somebody who has
// never given a cent should be able to read every pitch and watch the vote move
// — that is the single most persuasive thing on the site, and hiding it behind
// a login would be hiding the argument for joining.

export const metadata: Metadata = {
  title: "The Ballot — Deep Cut",
  description:
    "Every pitch on the slate, and where the vote stands. Members spend the votes they earned on the film they want made.",
};

export default function VotePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-8">
      <div className="flex flex-col gap-8">
        <header className="text-center">
          <MarqueeBulbs />
          <p className="eyebrow mt-3">Greenlight</p>
          <h1 className="glow-amber mt-1 font-display text-5xl leading-[0.92] text-amber">
            THE BALLOT
          </h1>
          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-cream/90">
            Every pitch here has been read and every director&apos;s previous work
            has been watched. What&apos;s left is the part we don&apos;t decide:{" "}
            <span className="text-amber">which one gets made first</span>.
          </p>
        </header>

        <Ballot />

        <section className="text-center">
          <Link
            href="/fund"
            className="font-mono text-[0.65rem] uppercase tracking-[0.15em] text-amber"
          >
            How the votes and the money work →
          </Link>
          <p className="mt-3 font-mono text-[0.6rem] leading-relaxed text-dim">
            Making one yourself?{" "}
            <Link href="/submit" className="text-ticket underline underline-offset-4">
              Send us your film
            </Link>{" "}
            — no agent, no fee.
          </p>
        </section>
      </div>
    </main>
  );
}
