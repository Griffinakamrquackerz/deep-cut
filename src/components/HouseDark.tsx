import type { ReactNode } from "react";

/**
 * The campy empty state — when a list has nothing, the house is dark. A
 * flickering marquee instead of a sad gray "no results."
 */
export default function HouseDark({
  title = "THE HOUSE IS DARK",
  line,
  children,
}: {
  title?: string;
  line?: string;
  children?: ReactNode;
}) {
  return (
    <div className="ticket-edge ticket-stub rounded bg-surface/60 px-6 py-8 text-center">
      <p className="text-3xl" aria-hidden>
        🍿
      </p>
      <p className="neon-flicker mt-2 font-display text-2xl tracking-wide text-amber">{title}</p>
      {line && <p className="mt-1 text-sm text-dim">{line}</p>}
      <p className="mt-2 font-mono text-[0.6rem] uppercase tracking-[0.3em] text-ticket">
        <span className="blink">●</span> be right back
      </p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
