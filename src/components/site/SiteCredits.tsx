import Link from "next/link";
import CreditRoll from "@/components/house/CreditRoll";

// The footer, as a billing block — the small type at the bottom of a one-sheet.
//
// The credit roll above it is written straight: every line is a true statement
// about how the house runs. The form is the joke; the copy doesn't tell one.
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
              { role: "shorts by", names: ["the filmmakers who made them"] },
              { role: "recommendations dealt from", names: ["the films you love"] },
              { role: "originals financed by", names: ["the members"] },
              { role: "greenlit by", names: ["the members"] },
              { role: "special thanks", names: ["your name here"], you: true },
            ]}
            tail="Free to join. Run by the people who watch."
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
            <Link href="/deal">The Deal</Link>
            <Link href="/tv">The Theatre</Link>
            <Link href="/fund">The Fund</Link>
            <Link href="/vote">The Ballot</Link>
            <Link href="/submit">Submit a film</Link>
            <Link href="/about">About</Link>
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
