// Client-side mirror of the server's gem label (see ../src/lib/gem.ts).
// The score itself is computed server-side and arrives on the rec; only the
// wording lives here, because it's presentation.

/**
 * Badge copy for a gem score, or null when the film hasn't earned one.
 *
 * The score is acclaim measured against reach — what a review means by "I
 * can't believe more people haven't seen this". Only the top two tiers say
 * anything: a stamp on every poster means nothing, and a stamp driven by low
 * vote count alone (as "Rare find" once was) promises quality it never checked.
 */
export function gemLabel(score: number | null | undefined): string | null {
  if (score == null) return null;
  if (score >= 5) return "Hidden gem";
  if (score >= 4) return "Rare find";
  return null;
}
