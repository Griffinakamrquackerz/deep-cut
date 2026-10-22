import { describe, expect, it } from "vitest";
import { SKIP_LINE_MIN_CENTS } from "../src/lib/stripe";
import { PERKS, tierFor } from "../src/lib/perks";
import { pointsFor, premiumMonthsFor, premiumUntilFor } from "../src/lib/fund";

// Skipping the line is a donation that happens to seat you, not a queue fee.
// Everything below is really one claim: the money goes through the same door as
// every other donation and earns the same things. If that stops being true the
// SkipTheLine widget starts lying to people at the moment they hand over money.

describe("skip the line", () => {
  it("cannot cost less than the lowest perk tier", () => {
    // The widget prints a tier name next to whatever amount is selected. If the
    // minimum dropped below the first rung, tierFor would return null and the
    // smallest donation would silently be worth no tier at all.
    const lowest = Math.min(...PERKS.map((p) => p.minCents));
    expect(SKIP_LINE_MIN_CENTS).toBeGreaterThanOrEqual(lowest);
    expect(tierFor(SKIP_LINE_MIN_CENTS)).not.toBeNull();
  });

  it("earns the same votes as any other donation of the same size", () => {
    // No bonus for paying to skip, and no penalty either.
    expect(pointsFor(SKIP_LINE_MIN_CENTS)).toBe(
      Math.floor(SKIP_LINE_MIN_CENTS / 100),
    );
    expect(pointsFor(2_500)).toBe(25);
    expect(pointsFor(10_000)).toBe(100);
  });

  it("puts the credit tier within reach at the preset amounts", () => {
    // $25 is the rung where a name goes in the credits, and it's the middle
    // preset in the widget on purpose — the default selection should be the
    // one that buys something a person actually cares about.
    expect(tierFor(2_500)?.credit).toBe("Special Thanks");
  });
});

describe("what a one-time contribution unlocks", () => {
  it("gives a month per $5, with a one-month floor", () => {
    // The landing page says a donation does more than buy a vote. It has to be
    // true of one-time support too, not just the monthly plan.
    expect(premiumMonthsFor(500)).toBe(1);
    expect(premiumMonthsFor(2_500)).toBe(5);
    expect(premiumMonthsFor(10_000)).toBe(20);
  });

  it("never gives less than a month, even below the floor", () => {
    expect(premiumMonthsFor(100)).toBe(1);
    expect(premiumMonthsFor(0)).toBe(1);
    expect(premiumMonthsFor(-500)).toBe(1);
  });

  it("extends an unexpired window rather than replacing it", () => {
    // Supporting twice in a month should end up as two months, not one.
    const inTwoMonths = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    const extended = new Date(premiumUntilFor(500, inTwoMonths)).getTime();
    expect(extended).toBeGreaterThan(new Date(inTwoMonths).getTime());
  });

  it("starts from now when the old window has already lapsed", () => {
    // Otherwise a member who lapsed a year ago would pay and get a date that
    // is still in the past.
    const lastYear = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    expect(new Date(premiumUntilFor(500, lastYear)).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(premiumUntilFor(500, null)).getTime()).toBeGreaterThan(Date.now());
  });
});
