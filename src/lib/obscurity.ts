// Obscurity score 1–5 from TMDB vote_count bands, with fame caps applied below.
// 1 = blockbuster, 3 = less-seen, 4 = niche, 5 = deep cut.
// Calibrated to TMDB's actual scale (its most-voted films sit ~30-40k votes —
// Inception ~37k, Shawshank ~30k — nothing like IMDb's 2M+):
//   >20k blockbuster · >8k popular · >2.5k less-seen · >800 niche · ≤800 deep cut

export const MIN_LESS_SEEN_OBSCURITY = 3;

export function obscurityFromVoteCount(voteCount: number): 1 | 2 | 3 | 4 | 5 {
  if (voteCount > 20_000) return 1;
  if (voteCount > 8_000) return 2;
  if (voteCount > 2_500) return 3;
  if (voteCount > 800) return 4;
  return 5;
}

/**
 * IMDb's audience is broad where TMDB's is cinephile, so its vote count is the
 * closest thing to "how many people have actually met this film" — and unlike
 * TMDB `popularity` it doesn't decay once the buzz fades. Scale is roughly an
 * order of magnitude above TMDB's.
 */
export function fameCapFromImdbVotes(votes: number): 1 | 2 | 3 | 4 | 5 {
  // Calibrated against real films rather than round numbers. The first cut was
  // >250k for a household name, and Inside Out 2 — a $1.7bn Pixar sequel — came
  // in at 245,290 and cleared the bar by 5k votes, landing at cap 2 and passing
  // a ◆◆ floor. Anything six figures deep has been met by everyone.
  if (votes > 150_000) return 1; // household name
  if (votes > 70_000) return 2; // big hit
  if (votes > 25_000) return 3; // widely seen
  // Below 25k this signal stays silent (5 = no cap). IMDb votes accumulate for
  // decades, so a real deep cut still gathers five figures — Possession (1981)
  // sits near 19k. Capping on those numbers would demote exactly the films the
  // app exists to surface, so the deep end is left to TMDB's vote count, whose
  // cinephile-skewed audience is well calibrated for it. This cap is aimed only
  // at films that are unambiguously widely seen.
  return 5;
}

/**
 * Honest obscurity: vote count says how many people have MET a film, but only
 * time turns "few votes" into "deep cut". A 2026 franchise tentpole has 600
 * votes because it opened last month, not because it's hidden — its TMDB
 * `popularity` (rolling current buzz) is screaming. So fame CAPS obscurity:
 *
 *  - IMDb votes, when known: the durable signal (see fameCapFromImdbVotes).
 *  - Any film: buzz ≥80 caps at 1, ≥35 at 2, ≥15 at 3 (deep cuts idle <15).
 *  - Films <2 years old: stricter caps (≥40→1, ≥18→2), and NEVER above 3 —
 *    deep-cut status (4–5) must be earned over time, full stop.
 *
 * The IMDb cap exists because TMDB votes alone are blind to streaming-native
 * releases. Spirited (2022, ~$75m, Ferrell/Reynolds, straight to Apple TV+)
 * has 786 TMDB votes — under the 800 line — and by 2026 its TMDB buzz had
 * decayed to 7, below every popularity cap. It scored 5/5 "RARE FIND" while
 * carrying tens of thousands of IMDb votes.
 *
 * Caps only lower the vote-count score, never raise it, so a genuinely met
 * film can't masquerade as obscure but a real deep cut is never inflated.
 */
export function effectiveObscurity(movie: {
  vote_count: number;
  popularity?: number | null;
  year?: number | null;
  /** IMDb vote count when we have it (OMDb). Ignored when null. */
  imdb_votes?: number | null;
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

  if (movie.imdb_votes != null && movie.imdb_votes > 0) {
    const imdbCap = fameCapFromImdbVotes(movie.imdb_votes);
    if (imdbCap < cap) cap = imdbCap;
  }

  return (base < cap ? base : cap) as 1 | 2 | 3 | 4 | 5;
}

/** ◆◆◆◇◇-style string for UI + taste card. */
export function obscurityDots(score: number): string {
  const s = Math.min(5, Math.max(1, Math.round(score)));
  return "◆".repeat(s) + "◇".repeat(5 - s);
}
