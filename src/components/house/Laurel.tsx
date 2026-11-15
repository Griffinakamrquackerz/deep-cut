// Laurels.
//
// What a film wears on its one-sheet when a festival took it: two branches
// and a line of small caps between them. Here the things between the branches
// are a film's ratings, and — where a short really did play a festival — the
// festival.
//
// The wreath is drawn, not an asset: nine leaves a side, laid along an arc
// and turned to follow it.

function Branch({ flip = false }: { flip?: boolean }) {
  const leaves = Array.from({ length: 9 }, (_, i) => {
    // From the foot of the wreath (about 7 o'clock) up to the tip (about 11).
    const a = ((118 + i * 15.5) * Math.PI) / 180;
    const r = 39;
    const x = 50 + Math.cos(a) * r;
    const y = 44 + Math.sin(a) * r * 0.86;
    const turn = (a * 180) / Math.PI + 62;
    const size = 5.2 + Math.sin((i / 8) * Math.PI) * 2.2;
    return (
      <ellipse
        key={i}
        cx={x}
        cy={y}
        rx={size}
        ry={size * 0.42}
        transform={`rotate(${turn} ${x} ${y})`}
      />
    );
  });
  return <g transform={flip ? "translate(100 0) scale(-1 1)" : undefined}>{leaves}</g>;
}

/** One sprig, for the start of a festival line. */
export function Sprig() {
  return (
    <svg viewBox="0 0 50 82" fill="currentColor" aria-hidden>
      <Branch />
    </svg>
  );
}

export default function Laurel({
  top,
  big,
  sub,
  title,
}: {
  /** Small caps over the top — who's saying it. */
  top: string;
  /** The thing itself. */
  big: string;
  sub?: string;
  /** Tooltip / accessible name. */
  title?: string;
}) {
  return (
    <span className="laurel" title={title} role="img" aria-label={title ?? `${top} ${big}`}>
      <svg viewBox="0 0 100 82" fill="currentColor" aria-hidden>
        <Branch />
        <Branch flip />
      </svg>
      <span className="laurel-in" aria-hidden>
        <span className="laurel-top">{top}</span>
        <span className="laurel-big">{big}</span>
        {sub ? <span className="laurel-sub">{sub}</span> : null}
      </span>
    </span>
  );
}
