import Link from "next/link";
import CreditRoll from "@/components/house/CreditRoll";

// The footer, as a billing block — the small type at the bottom of a one-sheet.
// `quiet` drops the links, for the same reason the nav has a quiet mode.

export default function SiteCredits({ quiet = false }: { quiet?: boolean }) {
  return (
    <footer className="lp-credits">
      <div className="lp-wrap">
        {/* The roll, then the billing block it would end on. */}
        <div className="lp-credits-roll">
          <CreditRoll
            logo={false}
            label="End credits"
            credits={[
              { role: "a picture house for", names: ["people who love movies"] },
              { role: "founded by", names: ["Griffin Howes"] },
              { role: "programmed by", names: ["the house"] },
              { role: "greenlit by", names: ["the members"] },
              { role: "projectionist", names: ["asleep in the booth"] },
              { role: "best boy", names: ["the obscurity dial"] },
              { role: "catering", names: ["one large popcorn"] },
              { role: "filmed in", names: ["glorious Deepcutscope"] },
              { role: "special thanks", names: ["your name here"], you: true },
            ]}
            tail="No algorithms were harmed in the making of this picture. Any resemblance to a streaming service you already pay for is purely coincidental."
          />
        </div>
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
        {!quiet && (
          <nav aria-label="Footer" className="lp-credits-nav">
            <Link href="/tv">The Theatre</Link>
            <Link href="/fund">The Fund</Link>
            <Link href="/vote">The Ballot</Link>
            <Link href="/submit">Submit a film</Link>
            <Link href="/login">Sign in</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </nav>
        )}
        <p className="lp-credits-legal">
          Metadata &amp; streaming data: TMDB (JustWatch). Not endorsed or certified by TMDB.
        </p>
      </div>
    </footer>
  );
}
