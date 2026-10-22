// "Hidden gem" scoring — acclaim measured against reach.
//
// Obscurity (see obscurity.ts) answers one question: how many people have met
// this film. That is a reach metric and nothing more, so it cannot tell a
// genuine hidden gem from a film nobody watched because it isn't good. Both
// score 5, and both used to get stamped "Rare find" — which is how Spirited
// ended up wearing a badge that promised something the score never measured.
//
// This is the other half: the thing a review means by "I can't believe more
// people haven't seen this". We have no review prose to read, so acclaim
// (IMDb/TMDB audience rating, Rotten Tomatoes critics) stands in for the
// sentiment, and it is weighed against how few people got there.

export interface GemInput {
  imdb_rating?: number | null; // /10, broad audience
  rt_rating?: number | null; // 0-100, critics
  vote_average?: number | null; // /10, TMDB audience
  imdb_votes?: number | null; // broad reach
  vote_count: number; // TMDB reach
}

/** Best available "how much did people love it", normalised to /10. */
export function loveScore(m: GemInput): number | null {
  // IMDb first — the largest audience sample. TMDB next. Critics last: a great
  // RT score with no audience rating is the weakest of the three signals.
  if (m.imdb_rating != null && m.imdb_rating > 0) return m.imdb_rating;
  if (m.vote_average != null && m.vote_average > 0) return m.vote_average;
  if (m.rt_rating != null && m.rt_rating > 0) return m.rt_rating / 10;
  return null;
}

/** 0 = everyone has met it … 3 = almost nobody has. */
export function scarcityTier(m: GemInput): 0 | 1 | 2 | 3 {
  // IMDb votes when known; TMDB votes otherwise, scaled up to IMDb's order of
  // magnitude (TMDB runs roughly 1:30 against IMDb on the same film).
  const reach = m.imdb_votes ?? m.vote_count * 30;
  if (reach < 5_000) return 3;
  if (reach < 25_000) return 2;
  if (reach < 100_000) return 1;
  return 0;
}

/**
 * 1–5: how strongly a film reads as "I can't believe more people haven't seen
 * this". null when there is no rating at all to judge on.
 *
 * Both halves gate each other, which is the whole point:
 *  - Unloved → 1. "Nobody saw it" plus "it isn't good" is not a hidden gem,
 *    it's just obscure.
 *  - Everyone has seen it → 2, however adored. Shawshank is not a find.
 *
 * This is a descriptive label, not the recommendation eligibility policy.
 * recommendation-quality.ts separately enforces the rating floor with reviewed
 * cult exceptions; those exceptions must not get inflated "Hidden gem" badges.
 */
export function gemScore(m: GemInput): 1 | 2 | 3 | 4 | 5 | null {
  const love = loveScore(m);
  if (love == null) return null;
  if (love < 6.5) return 1; // not acclaimed; scarcity is beside the point
  const scarcity = scarcityTier(m);
  if (scarcity === 0) return 2; // adored, but everyone already met it
  const acclaim = love >= 8 ? 3 : love >= 7.5 ? 2 : love >= 7 ? 1 : 0;
  if (acclaim === 0) return 2; // liked, not adored
  return Math.min(5, 1 + acclaim + scarcity) as 2 | 3 | 4 | 5;
}

/**
 * Badge copy, or null when a film hasn't earned one. Only the top two tiers
 * get to say anything — a stamp on every poster means nothing.
 */
export function gemLabel(score: number | null): string | null {
  if (score == null) return null;
  if (score >= 5) return "Hidden gem";
  if (score >= 4) return "Rare find";
  return null;
}
