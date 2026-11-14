import { describe, expect, it } from "vitest";
import {
  byGemScore,
  byRecommendationFit,
  byRecommendationPreference,
  CULT_RATING_EXCEPTIONS,
  gemRank,
  passesRecommendationRating,
} from "@/lib/recommendation-quality";

const movie = (imdb?: number | null, tmdb?: number | null) => ({
  id: 123, year: 2000, ratings: { imdb, tmdb },
});

describe("recommendation rating policy", () => {
  it("accepts the inclusive 6.5 boundary and rejects below it", () => {
    expect(passesRecommendationRating(movie(6.5))).toBe(true);
    expect(passesRecommendationRating(movie(6.49))).toBe(false);
  });
  it("uses IMDb, not whichever source has the higher rating", () => {
    expect(passesRecommendationRating(movie(6.4, 8))).toBe(false);
    expect(passesRecommendationRating(movie(7, 4))).toBe(true);
  });
  it("falls back to TMDB only when IMDb is absent", () => {
    expect(passesRecommendationRating(movie(null, 6.5))).toBe(true);
    expect(passesRecommendationRating(movie(undefined, 6.5))).toBe(true);
    expect(passesRecommendationRating(movie(null, 6.4))).toBe(false);
  });
  it("rejects unrated films and does not substitute critic percentages", () => {
    expect(passesRecommendationRating(movie(null, null))).toBe(false);
    expect(passesRecommendationRating({ id: 123, year: 2000 })).toBe(false);
    const criticsOnly = { ...movie(), ratings: { imdb: null, tmdb: null, rt: 99 } };
    expect(passesRecommendationRating(criticsOnly)).toBe(false);
  });
  it.each([NaN, Infinity, -1, 0, 11])("fails closed on invalid present IMDb rating %s", (rating) => {
    expect(passesRecommendationRating(movie(rating, 8))).toBe(false);
  });
  it("allows reviewed exceptions, including missing ratings, with matching IDs and years", () => {
    for (const entry of CULT_RATING_EXCEPTIONS) {
      expect(passesRecommendationRating({ ...movie(2), id: entry.id, year: entry.year })).toBe(true);
      expect(passesRecommendationRating({ id: entry.id, year: entry.year })).toBe(true);
      expect(passesRecommendationRating({ ...movie(2), id: entry.id, year: entry.year + 1 })).toBe(false);
    }
  });
  it("ranks by acclaim vs reach, not arrival order, and keeps ties stable", () => {
    const gem = { vote_count: 1_100, imdb_votes: 24_000, ratings: { imdb: 7.5, tmdb: null, rt: null } };
    const dud = { vote_count: 400, imdb_votes: 900, ratings: { imdb: 5.6, tmdb: null, rt: null } };
    const unrated = { vote_count: 400, imdb_votes: null, ratings: { imdb: null, tmdb: null, rt: null } };
    expect(gemRank(gem)).toBe(5);
    expect(gemRank(dud)).toBe(1);
    expect(gemRank(unrated)).toBe(0);
    expect(byGemScore([dud, gem, unrated, gem], (m) => m)).toEqual([gem, gem, dud, unrated]);
  });

  it("uses the obscurity goal as a soft tie-break after gem quality", () => {
    const lessSeen = {
      vote_count: 5_000,
      popularity: 5,
      year: 1980,
      imdb_votes: 9_000,
      ratings: { imdb: 8, tmdb: 8, rt: null },
    };
    const deepCut = { ...lessSeen, vote_count: 300 };
    const pool = [deepCut, lessSeen];

    expect(byRecommendationFit(pool, (m) => m, 3)).toEqual([lessSeen, deepCut]);
    expect(byRecommendationFit(pool, (m) => m, 5)).toEqual([deepCut, lessSeen]);
  });

  it("reorders within each recommendation batch without crossing batch order", () => {
    const newerShallow = { id: "a", batch: 2, status: "active", obscurity: 3, gem: 4 };
    const newerDeep = { id: "b", batch: 2, status: "active", obscurity: 5, gem: 4 };
    const olderDeep = { id: "c", batch: 1, status: "active", obscurity: 5, gem: 5 };
    expect(byRecommendationPreference([newerShallow, newerDeep, olderDeep], 5))
      .toEqual([newerDeep, newerShallow, olderDeep]);
  });
});
