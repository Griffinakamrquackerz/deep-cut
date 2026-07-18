import { describe, expect, it } from "vitest";
import { computeStreak } from "@/lib/streak";

const WEEK = 7 * 24 * 60 * 60 * 1000;
// A fixed "now" well past the epoch so week math is unambiguous.
const NOW = 2_000 * WEEK + 3 * 24 * 60 * 60 * 1000; // mid-week of week 2000
const weeksAgo = (n: number) => NOW - n * WEEK;

describe("computeStreak", () => {
  it("is zero with no logs", () => {
    const s = computeStreak([], NOW);
    expect(s.weeks).toBe(0);
    expect(s.atRisk).toBe(false);
    expect(s.loggedThisWeek).toBe(false);
  });

  it("counts the current week when logged", () => {
    const s = computeStreak([NOW], NOW);
    expect(s.weeks).toBe(1);
    expect(s.loggedThisWeek).toBe(true);
    expect(s.atRisk).toBe(false);
  });

  it("chains consecutive weeks", () => {
    const s = computeStreak([weeksAgo(0), weeksAgo(1), weeksAgo(2)], NOW);
    expect(s.weeks).toBe(3);
    expect(s.atRisk).toBe(false);
  });

  it("stays alive and at-risk when this week is not yet logged", () => {
    // logged last week and the week before, but not this week
    const s = computeStreak([weeksAgo(1), weeksAgo(2)], NOW);
    expect(s.weeks).toBe(2);
    expect(s.atRisk).toBe(true);
    expect(s.loggedThisWeek).toBe(false);
  });

  it("breaks when two full weeks are missed", () => {
    // nothing this week or last week → streak is broken
    const s = computeStreak([weeksAgo(2), weeksAgo(3)], NOW);
    expect(s.weeks).toBe(0);
    expect(s.atRisk).toBe(false);
  });

  it("dedupes multiple logs in the same week", () => {
    const s = computeStreak([weeksAgo(0), weeksAgo(0), weeksAgo(1)], NOW);
    expect(s.weeks).toBe(2);
  });

  it("stops at the first gap", () => {
    // this week, last week, then a gap, then older weeks
    const s = computeStreak([weeksAgo(0), weeksAgo(1), weeksAgo(3), weeksAgo(4)], NOW);
    expect(s.weeks).toBe(2);
  });

  it("accepts ISO strings and ignores unparseable values", () => {
    const iso = new Date(NOW).toISOString();
    const s = computeStreak([iso, "not-a-date"], NOW);
    expect(s.weeks).toBe(1);
  });
});
