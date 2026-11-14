import { describe, expect, it } from "vitest";
import { gemLabel, gemScore, loveScore, scarcityTier } from "@/lib/gem";

describe("gemScore (acclaim measured against reach)", () => {
  it("stamps nothing on a widely-seen film, however adored", () => {
    // The failure the score exists to prevent in the other direction: acclaim
    // alone must not make a find out of the most-watched film on IMDb.
    const shawshank = { imdb_rating: 9.3, imdb_votes: 2_900_000, vote_count: 30_000 };
    expect(gemScore(shawshank)).toBe(2);
    expect(gemLabel(gemScore(shawshank))).toBeNull();
  });

  it("stamps nothing on an obscure film that isn't good", () => {
    // Obscurity used to be the whole story, so this scored 5/5 "Rare find".
    const dud = { imdb_rating: 5.1, imdb_votes: 1_200, vote_count: 300 };
    expect(gemScore(dud)).toBe(1);
    expect(gemLabel(gemScore(dud))).toBeNull();
  });

  it("does not call a big streaming release a find", () => {
    // Spirited (2022): liked well enough, seen by plenty, 786 TMDB votes.
    const spirited = { imdb_rating: 6.6, imdb_votes: 52_000, vote_count: 786 };
    expect(gemScore(spirited)).toBe(2);
    expect(gemLabel(gemScore(spirited))).toBeNull();
  });

  it("rewards the real thing — loved by the few who found it", () => {
    const redTurtle = { imdb_rating: 7.5, imdb_votes: 24_000, vote_count: 1_100 };
    expect(gemScore(redTurtle)).toBe(5);
    expect(gemLabel(gemScore(redTurtle))).toBe("Hidden gem");

    const possession = { imdb_rating: 7.3, imdb_votes: 19_000, vote_count: 700 };
    expect(gemScore(possession)).toBe(4);
    expect(gemLabel(gemScore(possession))).toBe("Rare find");
  });

  it("falls back through IMDb → TMDB → critics for the love signal", () => {
    expect(loveScore({ imdb_rating: 7.1, vote_average: 6.2, vote_count: 10 })).toBe(7.1);
    expect(loveScore({ vote_average: 6.2, vote_count: 10 })).toBe(6.2);
    expect(loveScore({ rt_rating: 91, vote_count: 10 })).toBeCloseTo(9.1);
    expect(loveScore({ vote_count: 10 })).toBeNull();
  });

  it("scores nothing when there is no rating to judge on", () => {
    expect(gemScore({ vote_count: 40 })).toBeNull();
    expect(gemLabel(null)).toBeNull();
  });

  it("estimates reach from TMDB votes when IMDb's count is unknown", () => {
    // ~1:30 against IMDb, so 200 TMDB votes reads as very few people.
    expect(scarcityTier({ vote_count: 100 })).toBe(3);
    expect(scarcityTier({ vote_count: 600 })).toBe(2);
    expect(scarcityTier({ vote_count: 30_000 })).toBe(0);
    // An explicit IMDb count always wins over the estimate.
    expect(scarcityTier({ vote_count: 100, imdb_votes: 500_000 })).toBe(0);
  });

  it("describes low-rated cult material honestly without granting a badge", () => {
    // Eligibility is tested separately in recommendation-quality.test.ts.
    // This score must not inflate acclaim for any editorial exception.
    const terrifier = { imdb_rating: 5.6, imdb_votes: 40_000, vote_count: 900 };
    expect(gemScore(terrifier)).toBe(1);
    expect(gemLabel(gemScore(terrifier))).toBeNull();
  });
});
