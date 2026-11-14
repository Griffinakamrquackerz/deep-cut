import Link from "next/link";
import NavAuth from "./NavAuth";

// One nav for every public page — the front door and everything it links to.
//
// `quiet` strips it to the wordmark. /submit is opened from inside the native
// app in the system browser, and that visit must not be offered a path to the
// fund's checkout (see the note in src/app/submit/page.tsx), so the quiet nav
// links nowhere at all.

const LINKS = [
  { href: "/#deal", label: "The Deal" },
  { href: "/#greenlight", label: "The Greenlight" },
  { href: "/fund", label: "The Fund" },
  { href: "/vote", label: "The Ballot" },
  { href: "/submit", label: "Filmmakers" },
];

export default function SiteNav({
  cta = { href: "/#join", label: "Get in line" },
  quiet = false,
}: {
  cta?: { href: string; label: string };
  quiet?: boolean;
}) {
  return (
    <nav aria-label="Main navigation" className="lp-nav">
      <div className="lp-wrap lp-nav-in">
        {quiet ? (
          <span className="lp-logo">
            DEEP CUT<span className="lp-ticket">.</span>
          </span>
        ) : (
          <Link href="/" className="lp-logo">
            DEEP CUT<span className="lp-ticket">.</span>
          </Link>
        )}
        {!quiet && (
          <>
            <div className="lp-nav-links">
              {LINKS.map((l) => (
                <a key={l.href} href={l.href}>
                  {l.label}
                </a>
              ))}
            </div>
            <NavAuth cta={cta} />
          </>
        )}
      </div>
    </nav>
  );
}
