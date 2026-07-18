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
  /** film-crew hierarchy side: crew is "below", creative leads are "above" */
  side: "below" | "above";
}

// The crew ladder — climb from the coffee run to the director's chair, then
// cross above the line. On-set career progression, in order.
export const RANK_LADDER: RankTier[] = [
  { title: "Office PA", glyph: "☕", at: 0, side: "below", line: "Everyone starts on the coffee run." },
  { title: "Set PA", glyph: "🎧", at: 10, side: "below", line: "On set now — radio on, eyes up." },
  { title: "Key PA", glyph: "🔑", at: 25, side: "below", line: "You run the other PAs." },
  { title: "2nd 2nd AD", glyph: "🗒", at: 50, side: "below", line: "Call sheets and background — you're climbing." },
  { title: "2nd AD", glyph: "📣", at: 90, side: "below", line: "You wrangle the cast and the day." },
  { title: "1st AD", glyph: "⏱", at: 150, side: "below", line: "You run the floor — the set moves on your word." },
  { title: "Director", glyph: "🎥", at: 240, side: "above", line: "You crossed above the line. It's your picture now." },
  { title: "Executive Producer", glyph: "🎩", at: 380, side: "above", line: "You greenlight the whole show." },
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
