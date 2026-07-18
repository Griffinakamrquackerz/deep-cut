import { describe, expect, it } from "vitest";
import { computeTasteStats, RANK_LADDER } from "@/lib/rank";

// vote_count → obscurity: >20k=1, >8k=2, >2.5k=3, >800=4, ≤800=5
const popular = (id: number) => ({ id, vote_count: 25000 }); // obscurity 1
const deepCut = (id: number) => ({ id, vote_count: 300 }); // obscurity 5

describe("computeTasteStats", () => {
  it("starts everyone on the coffee run", () => {
    const s = computeTasteStats([]);
    expect(s.met).toBe(0);
    expect(s.rank.title).toBe("Office PA");
    expect(s.rank.side).toBe("below");
    expect(s.next?.title).toBe("Set PA");
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

  it("climbs the crew ladder at the documented thresholds", () => {
    // 12 reels → Set PA (10) but not yet Key PA (25): 12 popular films
    const twelve = computeTasteStats(Array.from({ length: 12 }, (_, i) => popular(i)));
    expect(twelve.rank.title).toBe("Set PA");
    // 10 deep cuts = 10 met + 20 bonus = 30 reels → Key PA (25)
    const keyPa = computeTasteStats(Array.from({ length: 10 }, (_, i) => deepCut(i)));
    expect(keyPa.rank.title).toBe("Key PA");
  });

  it("crosses above the line at Director", () => {
    // 80 deep cuts = 80 met + 160 bonus = 240 reels → Director
    const director = computeTasteStats(Array.from({ length: 80 }, (_, i) => deepCut(i)));
    expect(director.rank.title).toBe("Director");
    expect(director.rank.side).toBe("above");
  });

  it("caps at the top of the ladder with progress 1 and no next", () => {
    // 200 deep cuts = 200 met + 400 bonus = 600 reels ≥ 380 → Executive Producer
    const s = computeTasteStats(Array.from({ length: 200 }, (_, i) => deepCut(i)));
    expect(s.rank.title).toBe(RANK_LADDER[RANK_LADDER.length - 1].title);
    expect(s.rank.side).toBe("above");
    expect(s.next).toBeNull();
    expect(s.progress).toBe(1);
  });

  it("progress moves within a tier", () => {
    // 6 popular films = 6 reels: 6/10 of the way from Office PA (0) to Set PA (10)
    const s = computeTasteStats(Array.from({ length: 6 }, (_, i) => popular(i)));
    expect(s.progress).toBeCloseTo(0.6, 5);
  });
});
