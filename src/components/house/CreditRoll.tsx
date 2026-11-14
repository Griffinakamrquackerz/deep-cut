// End credits, crawling.
//
// Role in italics, name in caps. Pure CSS: the crawl pauses under a pointer
// or a keyboard focus, and with reduced motion it stops being a crawl and
// becomes a list you scroll yourself.
//
// The speed is set from the amount there is to read, so a long roll doesn't
// race and a short one doesn't dawdle.

export interface Credit {
  role: string;
  names: React.ReactNode[];
  /** Lights the names amber — the line that's about the reader. */
  you?: boolean;
}

export default function CreditRoll({
  credits,
  tail,
  logo = true,
  label = "Credits",
}: {
  credits: Credit[];
  /** The small print after the last card. */
  tail?: React.ReactNode;
  logo?: boolean;
  label?: string;
}) {
  const lines = credits.reduce((n, c) => n + 1 + c.names.length, 0) + (tail ? 3 : 0) + (logo ? 2 : 0);
  return (
    <div
      className="credit-roll"
      role="group"
      aria-label={label}
      tabIndex={0}
      style={{ "--dur": `${Math.max(16, Math.round(lines * 1.45))}s` } as React.CSSProperties}
    >
      <div className="credit-roll-crawl">
        {credits.map((c, i) => (
          <div key={`${c.role}-${i}`}>
            <p className="credit-role">{c.role}</p>
            {c.names.map((n, j) => (
              <p key={j} className={`credit-name ${c.you ? "is-you" : ""}`}>
                {n}
              </p>
            ))}
          </div>
        ))}
        {tail ? <p className="credit-tail">{tail}</p> : null}
        {logo ? (
          <p className="credit-logo" aria-hidden>
            DEEP CUT<span className="text-ticket">.</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
