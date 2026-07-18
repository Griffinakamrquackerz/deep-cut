// The Projectionist Ladder — taste made visibly compounding. No points, no
// coins: the currency is how far off the map you've traveled. Rank derives
// from films met (loved + logged, deduped) and deep cuts among them
// (obscurity 4–5), so it's recomputable from raw data anywhere.

import { obscurityFromVoteCount } from "./obscurity";

export interface RankTier {
  title: string;
  glyph: string;
  /** reels needed: met + 2 × deep cuts */
  at: number;
  line: string;
}

export const RANK_LADDER: RankTier[] = [
  { title: "Popcorn Civilian", glyph: "🍿", at: 0, line: "Everyone starts in the lobby." },
  { title: "Matinee Regular", glyph: "🎟", at: 12, line: "The usher knows your seat." },
  { title: "Back-Row Scholar", glyph: "🎓", at: 30, line: "You read the credits. All of them." },
  { title: "Cult Initiate", glyph: "🕯", at: 60, line: "You've seen things the algorithm hasn't." },
  { title: "Reel Archaeologist", glyph: "⛏", at: 110, line: "You dig where the vault gets dusty." },
  { title: "Phantom of the Archive", glyph: "👻", at: 180, line: "The projectionist asks YOU for picks." },
];

export interface TasteStats {
  met: number; // unique films loved or logged
  deepCuts: number; // of those, obscurity 4–5
  avgObscurity: number; // 1–5, one decimal
  reels: number; // met + 2 × deepCuts
  rank: RankTier;
  next: RankTier | null;
  /** 0–1 progress from current rank threshold to the next */
  progress: number;
}

export interface FilmVotes {
  id: number;
  vote_count: number | null;
}

export function computeTasteStats(films: FilmVotes[]): TasteStats {
  // Dedupe: a film loved AND logged is still one film met.
  const seen = new Map<number, number>();
  for (const f of films) {
    if (!seen.has(f.id)) seen.set(f.id, f.vote_count ?? 0);
  }
  const obscurities = [...seen.values()].map((v) => obscurityFromVoteCount(v));
  const met = obscurities.length;
  const deepCuts = obscurities.filter((o) => o >= 4).length;
  const avgObscurity = met
    ? Math.round((obscurities.reduce((a, b) => a + b, 0) / met) * 10) / 10
    : 0;
  const reels = met + 2 * deepCuts;

  let rank = RANK_LADDER[0];
  let next: RankTier | null = RANK_LADDER[1] ?? null;
  for (let i = RANK_LADDER.length - 1; i >= 0; i--) {
    if (reels >= RANK_LADDER[i].at) {
      rank = RANK_LADDER[i];
      next = RANK_LADDER[i + 1] ?? null;
      break;
    }
  }
  const progress = next ? Math.min(1, (reels - rank.at) / (next.at - rank.at)) : 1;

  return { met, deepCuts, avgObscurity, reels, rank, next, progress };
}
