// Obscurity score 1–5 from TMDB vote_count buckets.
// 1 = everyone's seen it, 5 = deep cut. Tune buckets against real data later.

export function obscurityFromVoteCount(voteCount: number): 1 | 2 | 3 | 4 | 5 {
  if (voteCount > 500_000) return 1;
  if (voteCount > 100_000) return 2;
  if (voteCount > 20_000) return 3;
  if (voteCount > 3_000) return 4;
  return 5;
}

/** ◆◆◆◇◇-style string for UI + taste card. */
export function obscurityDots(score: number): string {
  const s = Math.min(5, Math.max(1, Math.round(score)));
  return "◆".repeat(s) + "◇".repeat(5 - s);
}
