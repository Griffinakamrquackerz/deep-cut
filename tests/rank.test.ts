import { describe, expect, it } from "vitest";
import { computeTasteStats, RANK_LADDER } from "@/lib/rank";

// vote_count → obscurity: >20k=1, >8k=2, >2.5k=3, >800=4, ≤800=5
const popular = (id: number) => ({ id, vote_count: 25000 }); // obscurity 1
const deepCut = (id: number) => ({ id, vote_count: 300 }); // obscurity 5

describe("computeTasteStats", () => {
  it("starts everyone in the lobby", () => {
    const s = computeTasteStats([]);
    expect(s.met).toBe(0);
    expect(s.rank.title).toBe("Popcorn Civilian");
    expect(s.next?.title).toBe("Matinee Regular");
    expect(s.progress).toBe(0);
  });

  it("dedupes films loved AND logged into one met", () => {
    const s = computeTasteStats([popular(1), popular(1), deepCut(2), deepCut(2)]);
    expect(s.met).toBe(2);
    expect(s.deepCuts).toBe(1);
  });

  it("deep cuts count double toward reels", () => {
    const s = computeTasteStats([popular(1), deepCut(2)]);
    expect(s.reels).toBe(2 + 2); // 2 met + 2×1 deep cut
  });

  it("averages obscurity to one decimal", () => {
    const s = computeTasteStats([popular(1), deepCut(2)]); // (1+5)/2
    expect(s.avgObscurity).toBe(3);
  });

  it("climbs the ladder at the documented thresholds", () => {
    // 12 reels → Matinee Regular: 12 popular films
    const twelve = computeTasteStats(Array.from({ length: 12 }, (_, i) => popular(i)));
    expect(twelve.rank.title).toBe("Matinee Regular");
    // 10 deep cuts = 10 met + 20 bonus = 30 reels → Back-Row Scholar
    const scholar = computeTasteStats(Array.from({ length: 10 }, (_, i) => deepCut(i)));
    expect(scholar.rank.title).toBe("Back-Row Scholar");
  });

  it("caps at the top of the ladder with progress 1 and no next", () => {
    const s = computeTasteStats(Array.from({ length: 100 }, (_, i) => deepCut(i))); // 300 reels
    expect(s.rank.title).toBe(RANK_LADDER[RANK_LADDER.length - 1].title);
    expect(s.next).toBeNull();
    expect(s.progress).toBe(1);
  });

  it("progress moves within a tier", () => {
    // 6 popular films = 6 reels: halfway from 0 to 12
    const s = computeTasteStats(Array.from({ length: 6 }, (_, i) => popular(i)));
    expect(s.progress).toBeCloseTo(0.5, 5);
  });
});
