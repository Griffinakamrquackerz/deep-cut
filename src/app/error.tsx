"use client";
import Link from "next/link";
import { useEffect } from "react";

// The film broke.
//
// Something threw while a page was rendering. In a booth that's the print
// jamming in the gate and the lamp burning a hole through the frame, and the
// fix is the same here as there: stop, splice, run it again. `reset` is the
// splice — it re-renders the segment that failed without reloading the app.

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface it — an error page that swallows its error can't be debugged.
    console.error(error);
  }, [error]);

  return (
    <main className="card-page">
      <div className="film-burn" aria-hidden />
      <div className="card-page-in">
        <div className="card-frame">
          <p className="card-big">
            The film
            <br />
            broke
          </p>
          <p className="card-sorry">Please remain seated.</p>
          <p className="card-signed">— The Projectionist</p>
        </div>
        <p className="card-note">
          Something jammed in the gate on our end, not yours. Splicing it usually does it.
          {error.digest ? ` (Print no. ${error.digest})` : ""}
        </p>
        <div className="card-actions">
          <button type="button" onClick={() => reset()} className="card-btn card-btn--amber">
            Splice it &amp; run it again
          </button>
          <Link href="/" className="card-btn card-btn--ghost">
            Back to the house
          </Link>
        </div>
      </div>
    </main>
  );
}
