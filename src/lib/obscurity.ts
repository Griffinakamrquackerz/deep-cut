// Obscurity score 1–5 from TMDB vote_count buckets.
// 1 = everyone's seen it, 5 = deep cut.
// Calibrated to TMDB's actual scale (its most-voted films sit ~30-40k votes —
// Inception ~37k, Shawshank ~30k — nothing like IMDb's 2M+):
//   >20k mega-blockbuster · >8k big hit · >2.5k well known · >800 niche · ≤800 deep cut

export function obscurityFromVoteCount(voteCount: number): 1 | 2 | 3 | 4 | 5 {
  if (voteCount > 20_000) return 1;
  if (voteCount > 8_000) return 2;
  if (voteCount > 2_500) return 3;
  if (voteCount > 800) return 4;
  return 5;
}

/**
 * Honest obscurity: vote count says how many people have MET a film, but only
 * time turns "few votes" into "deep cut". A 2026 franchise tentpole has 600
 * votes because it opened last month, not because it's hidden — its TMDB
 * `popularity` (rolling current buzz) is screaming. So fame CAPS obscurity:
 *
 *  - Any film: buzz ≥80 caps at 1, ≥35 at 2, ≥15 at 3 (deep cuts idle <15).
 *  - Films <2 years old: stricter caps (≥40→1, ≥18→2), and NEVER above 3 —
 *    deep-cut status (4–5) must be earned over time, full stop.
 *
 * Caps only lower the vote-count score, never raise it, so a genuinely met
 * film can't masquerade as obscure but a real deep cut is never inflated.
 */
export function effectiveObscurity(movie: {
  vote_count: number;
  popularity?: number | null;
  year?: number | null;
}): 1 | 2 | 3 | 4 | 5 {
  const base = obscurityFromVoteCount(movie.vote_count);
  const pop = movie.popularity ?? 0;
  const isRecent = movie.year != null && movie.year >= new Date().getFullYear() - 2;

  let cap: 1 | 2 | 3 | 4 | 5 = 5;
  if (isRecent) {
    if (pop >= 40) cap = 1;
    else if (pop >= 18) cap = 2;
    else cap = 3; // new + quiet can be niche, never yet a certified deep cut
  } else {
    if (pop >= 80) cap = 1;
    else if (pop >= 35) cap = 2;
    else if (pop >= 15) cap = 3;
  }
  return (base < cap ? base : cap) as 1 | 2 | 3 | 4 | 5;
}

/** ◆◆◆◇◇-style string for UI + taste card. */
export function obscurityDots(score: number): string {
  const s = Math.min(5, Math.max(1, Math.round(score)));
  return "◆".repeat(s) + "◇".repeat(5 - s);
}
