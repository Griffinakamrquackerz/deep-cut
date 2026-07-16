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

/** ◆◆◆◇◇-style string for UI + taste card. */
export function obscurityDots(score: number): string {
  const s = Math.min(5, Math.max(1, Math.round(score)));
  return "◆".repeat(s) + "◇".repeat(5 - s);
}
