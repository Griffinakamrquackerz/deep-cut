import type { Metadata } from "next";
import Link from "next/link";

// Reel missing.
//
// When a print arrived at a theatre a reel short, the projectionist spliced
// in a card and carried on. This is that card. A 404 is exactly this
// situation — the thing you came for isn't in the can — so it gets the same
// apology, signed the same way.

export const metadata: Metadata = { title: "Reel missing", robots: { index: false } };

export default function NotFound() {
  return (
    <main className="card-page">
      <div className="card-page-in">
        <div className="card-frame">
          <p className="card-big">
            Reel
            <br />
            missing
          </p>
          <p className="card-sorry">Sorry for the inconvenience.</p>
          <p className="card-signed">— The Management</p>
        </div>
        <p className="card-note">
          Error 404. That page isn&apos;t in the can. It may have moved, or it was never shot.
        </p>
        <div className="card-actions">
          <Link href="/" className="card-btn card-btn--amber">
            Back to the house
          </Link>
          <Link href="/tv" className="card-btn card-btn--ghost">
            Watch a short instead
          </Link>
        </div>
      </div>
    </main>
  );
}
