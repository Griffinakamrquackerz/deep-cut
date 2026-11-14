import { describe, expect, it } from "vitest";
import { effectiveObscurity, obscurityFromVoteCount, fameCapFromImdbVotes } from "@/lib/obscurity";

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
  // Regression: the reason IMDb votes exist as a signal at all.
  it("a big streaming release is not a deep cut just because TMDB barely voted", () => {
    // Spirited (2022): ~$75m, Ferrell/Reynolds, straight to Apple TV+. TMDB has
    // 786 votes — under the 800 line — and by 2026 its TMDB buzz had decayed to
    // 7, below every popularity cap. It was dealt as a 5/5 "RARE FIND".
    const spirited = { vote_count: 786, popularity: 7.26, year: 2022 };
    expect(effectiveObscurity(spirited)).toBe(5); // what TMDB alone believes
    expect(effectiveObscurity({ ...spirited, imdb_votes: 52_000 })).toBe(3);
  });

  it("IMDb votes only ever lower the score, never raise it", () => {
    // A genuinely unmet film is untouched by the new cap.
    const obscure = { vote_count: 400, popularity: 3, year: 1978, imdb_votes: 900 };
    expect(effectiveObscurity(obscure)).toBe(5);
    // Nor is an old cult film with decades of accumulated IMDb votes —
    // Possession (1981) sits near 19k and must stay a deep cut.
    const possession = { vote_count: 700, popularity: 8, year: 1981, imdb_votes: 19_000 };
    expect(effectiveObscurity(possession)).toBe(5);
    // And a famous film can't be laundered into obscurity by a low IMDb count.
    const famous = { vote_count: 30_000, popularity: 60, year: 1994, imdb_votes: 10 };
    expect(effectiveObscurity(famous)).toBe(1);
  });

  it("a blockbuster is never a deep cut, however TMDB scores it", () => {
    // Inside Out 2 was dealt under a ◆◆ floor: recent enough that the
    // popularity cap allowed 2, and 245,290 IMDb votes sat just under the
    // original 250k household-name line.
    const insideOut2 = { vote_count: 6_000, popularity: 20, year: 2024, imdb_votes: 245_290 };
    expect(effectiveObscurity(insideOut2)).toBe(1);
  });

  it("maps IMDb vote counts onto the fame ladder", () => {
    expect(fameCapFromImdbVotes(1_200_000)).toBe(1);
    expect(fameCapFromImdbVotes(245_290)).toBe(1); // Inside Out 2
    expect(fameCapFromImdbVotes(90_000)).toBe(2);
    expect(fameCapFromImdbVotes(40_000)).toBe(3);
    // Below 25k the signal stays silent so real deep cuts aren't demoted.
    expect(fameCapFromImdbVotes(20_000)).toBe(5);
    expect(fameCapFromImdbVotes(500)).toBe(5);
  });
});
