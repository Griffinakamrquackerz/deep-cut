import LandingFX from "@/components/landing/LandingFX";
import SiteNav from "./SiteNav";
import SiteCredits from "./SiteCredits";
import "@/components/landing/landing.css";

// The public site's frame: the front door's nav, its strip of film, and its
// end credits, around any page a stranger can land on.
//
// The app proper lives in a phone-width column (see .app-frame). `.lp` is what
// lets a page out of it — the pitch pages get the whole wall, same as the
// landing page they're linked from, so following a link off the front door
// doesn't feel like walking into a different building.

export function Slate({ reel, children }: { reel: string; children?: React.ReactNode }) {
  return (
    <p className="lp-slate">
      <b>{reel}</b>
      {children ? <span>{children}</span> : null}
    </p>
  );
}

/** A page's opening: slate, projected title, lede — and room beside it. */
export function PageHero({
  reel,
  slate,
  title,
  lede,
  aside,
  children,
}: {
  reel: string;
  slate?: React.ReactNode;
  title: React.ReactNode;
  lede?: React.ReactNode;
  /** Sits to the right on a desk, underneath on a phone. */
  aside?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="lp-pagehero">
      <div className={`lp-wrap ${aside ? "lp-pagehero-grid" : ""}`}>
        <div>
          <Slate reel={reel}>{slate}</Slate>
          <h1 className="lp-h2 lp-pagehero-title rack-in">{title}</h1>
          {lede ? (
            <p className="lp-lede rack-in" style={{ "--i": 2 } as React.CSSProperties}>
              {lede}
            </p>
          ) : null}
          {children}
        </div>
        {aside ? <div className="lp-pagehero-aside">{aside}</div> : null}
      </div>
    </header>
  );
}

export default function SiteShell({
  children,
  quiet = false,
  strip = true,
}: {
  children: React.ReactNode;
  /** No onward links anywhere — see SiteNav. */
  quiet?: boolean;
  /** Perforations down the page edges. Off for short, single-purpose pages. */
  strip?: boolean;
}) {
  return (
    <div className="lp">
      <LandingFX />
      <SiteNav quiet={quiet} />
      <main className="lp-body lp-body--page">
        {strip && (
          <>
            <div className="lp-perfs lp-perfs--l" aria-hidden />
            <div className="lp-perfs lp-perfs--r" aria-hidden />
            <div className="lp-edgeprint" aria-hidden />
          </>
        )}
        {children}
      </main>
      <SiteCredits quiet={quiet} />
    </div>
  );
}
