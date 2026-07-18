import type { StreakStats } from "@/lib/streak";

/**
 * The projection streak — consecutive weeks with a logged watch. Framed as a
 * running reel: keep the booth lit. When the streak is alive but this week is
 * still dark, we nudge instead of scold.
 */
export default function StreakBadge({ streak }: { streak: StreakStats }) {
  if (streak.weeks === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-line bg-surface/60 p-3">
        <span className="text-2xl grayscale" aria-hidden>
          🎞
        </span>
        <div>
          <p className="font-mono text-[0.7rem] uppercase tracking-widest text-dim">
            No reel running
          </p>
          <p className="font-mono text-[0.6rem] text-dim">
            Log a watch this week to light the booth.
          </p>
        </div>
      </div>
    );
  }

  const unit = streak.weeks === 1 ? "week" : "weeks";
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 ${
        streak.atRisk ? "border-ticket/50 bg-ticket/5" : "border-amber/50 bg-amber/5"
      }`}
    >
      <span className="text-2xl" aria-hidden>
        {streak.atRisk ? "🕯" : "🔥"}
      </span>
      <div>
        <p className="font-display text-xl leading-none text-amber">
          {streak.weeks} {unit} running
        </p>
        <p className="mt-0.5 font-mono text-[0.6rem] text-dim">
          {streak.atRisk
            ? "Booth's flickering — log one this week to keep the reel alive."
            : "Projection streak lit. Same time next week."}
        </p>
      </div>
    </div>
  );
}
