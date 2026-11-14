import Link from "next/link";
import LandingFX from "@/components/landing/LandingFX";
import "@/components/landing/landing.css";

// A doorway: one screen, one job, under the lamp.
//
// For the pages somebody passes through rather than reads — signing in,
// setting a password, the stop after checkout, an unsubscribe link. No nav to
// wander off into and no footer to scroll to; the wordmark is the way home and
// the thing they came to do is the only other thing on the screen.
//
// `split` puts the title on the wall to the left and the action to the right
// on a desk (the sign-in door). Without it everything is stacked and centred.

export default function Doorway({
  reel,
  slate,
  title,
  lede,
  split = false,
  children,
}: {
  reel: string;
  slate?: React.ReactNode;
  title: React.ReactNode;
  lede?: React.ReactNode;
  split?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="lp lp-doorway">
      <LandingFX />
      <nav aria-label="Main navigation" className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <Link href="/" className="lp-logo">
            DEEP CUT<span className="lp-ticket">.</span>
          </Link>
        </div>
      </nav>
      <main className={`lp-wrap lp-doorway-stage ${split ? "lp-doorway-stage--split" : ""}`}>
        <div className="lp-doorway-copy">
          <p className="lp-slate">
            <b>{reel}</b>
            {slate ? <span>{slate}</span> : null}
          </p>
          <h1 className="lp-h2 lp-doorway-title rack-in">{title}</h1>
          {lede ? (
            <p className="lp-lede rack-in" style={{ "--i": 2 } as React.CSSProperties}>
              {lede}
            </p>
          ) : null}
        </div>
        {children ? <div className="lp-doorway-action">{children}</div> : null}
      </main>
    </div>
  );
}
