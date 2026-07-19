import { describe, expect, it } from "vitest";
import { effectiveObscurity, obscurityFromVoteCount } from "@/lib/obscurity";

const thisYear = new Date().getFullYear();

describe("obscurityFromVoteCount (base ladder)", () => {
  it("keeps the calibrated buckets", () => {
    expect(obscurityFromVoteCount(25_000)).toBe(1);
    expect(obscurityFromVoteCount(10_000)).toBe(2);
    expect(obscurityFromVoteCount(3_000)).toBe(3);
    expect(obscurityFromVoteCount(1_000)).toBe(4);
    expect(obscurityFromVoteCount(300)).toBe(5);
  });
});

describe("effectiveObscurity (fame caps the score)", () => {
  it("the Minions bug: a brand-new tentpole with few votes is NOT a rare find", () => {
    // 2026 franchise release, votes still accumulating, buzz through the roof
    const minions = { vote_count: 600, popularity: 400, year: thisYear };
    expect(effectiveObscurity(minions)).toBe(1);
  });

  it("a new mid-buzz sequel caps at 2", () => {
    const prada2 = { vote_count: 1_531, popularity: 25, year: thisYear };
    expect(effectiveObscurity(prada2)).toBe(2);
  });

  it("a quiet new indie can be niche (3) but never a certified deep cut", () => {
    const indie = { vote_count: 300, popularity: 6, year: thisYear - 1 };
    expect(effectiveObscurity(indie)).toBe(3);
  });

  it("an old low-vote, low-buzz film keeps its full deep-cut score", () => {
    const possession = { vote_count: 700, popularity: 8, year: 1981 };
    expect(effectiveObscurity(possession)).toBe(5);
  });

  it("an old film trending hard right now is capped, never inflated", () => {
    const viral = { vote_count: 900, popularity: 90, year: 1995 };
    expect(effectiveObscurity(viral)).toBe(1);
  });

  it("a classic with mega votes stays 1 regardless of quiet buzz", () => {
    const shawshank = { vote_count: 30_000, popularity: 12, year: 1994 };
    expect(effectiveObscurity(shawshank)).toBe(1);
  });

  it("missing popularity/year degrades to the vote-count ladder", () => {
    expect(effectiveObscurity({ vote_count: 300 })).toBe(5);
    expect(effectiveObscurity({ vote_count: 300, popularity: null, year: null })).toBe(5);
  });
});
