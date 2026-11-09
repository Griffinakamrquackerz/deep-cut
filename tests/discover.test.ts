import { describe, expect, it } from "vitest";
import { voteBandForObscurity, TMDB_GENRE_IDS } from "@/lib/tmdb";
import { obscurityFromVoteCount } from "@/lib/obscurity";
import { topGenreIds } from "@/lib/engine";
import { tmdbProviderIds } from "@/lib/services";

describe("Discover fallback — vote bands", () => {
  it("full range 1-5 has a junk floor and no ceiling", () => {
    expect(voteBandForObscurity(1, 5)).toEqual({ gte: 50, lte: undefined });
  });

  it("less-seen band 3-5 caps at the 8,000-vote boundary", () => {
    expect(voteBandForObscurity(3, 5)).toEqual({ gte: 50, lte: 8_000 });
  });

  it("bands are consistent with the scoring buckets", () => {
    // every vote count inside band (2,4) must score obscurity 2..4
    const { gte, lte } = voteBandForObscurity(2, 4);
    for (const votes of [gte + 1, 1_000, 5_000, lte! - 1]) {
      const score = obscurityFromVoteCount(votes);
      expect(score).toBeGreaterThanOrEqual(2);
      expect(score).toBeLessThanOrEqual(4);
    }
  });
});

describe("Discover fallback — taste-genre proxy", () => {
  it("ranks the user's dominant genres", () => {
    const loved = [
      { genres: ["Drama", "Comedy"] },
      { genres: ["Drama"] },
      { genres: ["Drama", "Thriller"] },
      { genres: ["Comedy"] },
    ];
    const ids = topGenreIds(loved, 2);
    expect(ids[0]).toBe(TMDB_GENRE_IDS.Drama);
    expect(ids[1]).toBe(TMDB_GENRE_IDS.Comedy);
  });

  it("ignores unknown genre labels", () => {
    expect(topGenreIds([{ genres: ["Mumblecore"] }])).toEqual([]);
  });
});

describe("Discover fallback — provider ids", () => {
  it("maps services to TMDB provider ids", () => {
    const ids = tmdbProviderIds(["netflix", "tubi"]);
    expect(ids).toContain(8); // Netflix
    expect(ids).toContain(73); // Tubi
  });
});
