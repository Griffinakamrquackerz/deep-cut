import type { TasteStats } from "@/lib/rank";

/**
 * The Projectionist Card — taste, visibly compounding. Rank title, a
 * sprocket progress strip to the next tier, and the three stats the house
 * actually respects: films met, deep cuts, and how far off the map you sit.
 */
export default function ProjectionistCard({
  stats,
  isMe = false,
}: {
  stats: TasteStats;
  isMe?: boolean;
}) {
  const dots = Math.round(stats.avgObscurity);
  return (
    <div className="film-card rounded-lg p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="eyebrow">Projectionist rank</p>
        <p className="font-mono text-[0.6rem] text-dim">{stats.reels} reels</p>
      </div>
      <p className="mt-1 font-display text-3xl leading-tight text-amber">
        {stats.rank.glyph} {stats.rank.title.toUpperCase()}
      </p>
      <p className="font-mono text-[0.65rem] italic text-dim">“{stats.rank.line}”</p>

      {/* Sprocket progress strip toward the next tier */}
      {stats.next ? (
        <div className="mt-3">
          <div
            className="relative h-3 overflow-hidden rounded-full border border-line bg-bg"
            role="progressbar"
            aria-valuenow={Math.round(stats.progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progress to ${stats.next.title}`}
          >
            <div
              className="h-full bg-amber transition-[width] duration-700"
              style={{ width: `${Math.max(4, stats.progress * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-right font-mono text-[0.6rem] text-dim">
            next: {stats.next.glyph} {stats.next.title} at {stats.next.at} reels
          </p>
        </div>
      ) : (
        <p className="mt-3 font-mono text-[0.65rem] uppercase tracking-widest text-ticket">
          ★ Top of the ladder — the archive is yours ★
        </p>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded border border-line bg-bg/60 p-2">
          <p className="font-display text-2xl text-cream">{stats.met}</p>
          <p className="font-mono text-[0.55rem] uppercase tracking-wider text-dim">
            films met
          </p>
        </div>
        <div className="rounded border border-line bg-bg/60 p-2">
          <p className="font-display text-2xl text-cream">{stats.deepCuts}</p>
          <p className="font-mono text-[0.55rem] uppercase tracking-wider text-dim">
            deep cuts
          </p>
        </div>
        <div className="rounded border border-line bg-bg/60 p-2">
          <p className="font-display text-2xl tracking-tight text-amber">
            {"◆".repeat(dots)}
            <span className="text-line">{"◆".repeat(Math.max(0, 5 - dots))}</span>
          </p>
          <p className="font-mono text-[0.55rem] uppercase tracking-wider text-dim">
            off the map
          </p>
        </div>
      </div>

      {isMe && stats.next && (
        <p className="mt-2 text-center font-mono text-[0.6rem] text-dim">
          deep cuts count double — crank the obscurity dial 🎚
        </p>
      )}
    </div>
  );
}
