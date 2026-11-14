import type { Metadata } from "next";
import Link from "next/link";
import Ballot from "@/components/Ballot";
import SiteShell, { PageHero } from "@/components/site/SiteShell";

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
    <SiteShell>
      <PageHero
        reel="Greenlight"
        slate="The slate, and where the vote stands"
        title={
          <>
            The <em>ballot.</em>
          </>
        }
        lede={
          <>
            Every pitch here has been read and every director&apos;s previous work has been watched.
            What&apos;s left is the part we don&apos;t decide: <strong>which one gets made first</strong>.
          </>
        }
      />

      <section className="lp-section lp-section--tight">
        <div className="lp-wrap">
          <div className="lp-col lp-stack">
            <div className="lp-panel">
              <Ballot />
            </div>

            <div style={{ textAlign: "center" }}>
              <Link href="/fund" className="lp-link">
                How the votes and the money work
              </Link>
              <p className="lp-note" style={{ marginTop: "1rem" }}>
                Making one yourself?{" "}
                <Link href="/submit" className="lp-link">
                  Send us your film
                </Link>{" "}
                — no agent, no fee.
              </p>
            </div>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
