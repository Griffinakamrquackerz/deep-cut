// Weekly watch streak — how many consecutive weeks you've logged at least one
// watch. Weekly (not daily) on purpose: nobody watches a feature every night,
// so the house rewards a steady habit, not a grind. Pure and recomputable from
// raw watch timestamps, so it can be shown anywhere without a stored counter.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Whole weeks since the Unix epoch (UTC). Monotonic, so two timestamps in
 * consecutive weeks differ by exactly 1. Epoch week boundaries are Thu→Wed;
 * for a streak the exact boundary doesn't matter, only that buckets are a
 * consistent 7 days.
 */
function weekIndex(ms: number): number {
  return Math.floor(ms / WEEK_MS);
}

export interface StreakStats {
  /** consecutive weeks with activity, counting an in-progress current week */
  weeks: number;
  /** streak is alive but the current week hasn't been logged yet — nudge them */
  atRisk: boolean;
  loggedThisWeek: boolean;
}

/**
 * @param watchedAt raw `watched_at` values (ISO strings, epoch ms, or Dates)
 * @param now       current time in epoch ms (injected so this stays pure/testable)
 */
export function computeStreak(
  watchedAt: Array<string | number | Date>,
  now: number,
): StreakStats {
  const nowWeek = weekIndex(now);
  const active = new Set<number>();
  for (const w of watchedAt) {
    const t = w instanceof Date ? w.getTime() : new Date(w).getTime();
    if (Number.isFinite(t)) active.add(weekIndex(t));
  }

  const loggedThisWeek = active.has(nowWeek);
  // Anchor the streak at the current week if it's already logged; otherwise the
  // current week is still "in progress", so a log last week keeps it alive.
  let cursor: number;
  if (loggedThisWeek) cursor = nowWeek;
  else if (active.has(nowWeek - 1)) cursor = nowWeek - 1;
  else return { weeks: 0, atRisk: false, loggedThisWeek: false };

  let weeks = 0;
  while (active.has(cursor)) {
    weeks++;
    cursor--;
  }
  return { weeks, atRisk: !loggedThisWeek, loggedThisWeek };
}
