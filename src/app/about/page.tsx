import type { Metadata } from "next";
import Link from "next/link";
import SiteShell, { PageHero } from "@/components/site/SiteShell";
import FounderNote from "@/components/FounderNote";

// The director's statement, whole.
//
// The front page carries the opening of Griffin's letter and a link here. The
// letter itself is his, in his words and his order (see FounderNote) — this
// page presents it and adds nothing to it.

export const metadata: Metadata = {
  title: "Director's statement — Deep Cut",
  description:
    "Why Deep Cut exists, from the filmmaker who built it: a picture house for people who stay through the credits.",
};

export default function AboutPage() {
  return (
    <SiteShell>
      <PageHero
        reel="Director's statement"
        slate="Griffin Howes · founder"
        title={
          <>
            Made by a filmmaker. <span className="lp-serif">For people who stay through the credits.</span>
          </>
        }
      />
      <section className="lp-section lp-section--tight">
        <div className="lp-wrap">
          <div className="lp-col">
            <div className="lp-paper" data-reveal="rise">
              <p className="lp-paper-head">
                <b>Director&apos;s statement</b>
                <span>Deep Cut · press kit · p. 1</span>
              </p>
              <FounderNote />
            </div>
            <p
              style={{ marginTop: "2.25rem", display: "flex", flexWrap: "wrap", gap: "1rem 1.5rem", alignItems: "center" }}
            >
              <Link href="/#join" className="lp-btn lp-btn--ticket">
                Take a seat <span aria-hidden>↗</span>
              </Link>
              <Link href="/fund" className="lp-more">
                How the fund works
              </Link>
              <Link href="/submit" className="lp-more">
                Submit your film
              </Link>
            </p>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
