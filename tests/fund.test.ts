import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fundCurrency, fundCutCents, goalCents, pointCap, pointsFor, sharePct } from "@/lib/fund";
import { CHECKOUT_CURRENCY } from "@/lib/stripe";

const ENV = { ...process.env };
beforeEach(() => {
  delete process.env.FUND_SHARE_PCT;
  delete process.env.FUND_POINT_CAP;
  delete process.env.FUND_GOAL_CENTS;
});
afterEach(() => {
  process.env = { ...ENV };
});

describe("the Fund's cut", () => {
  it("takes the configured share of a payment", () => {
    expect(fundCutCents(1000)).toBe(600); // 60% of $10
  });

  it("rounds down, so the pot is never over-promised", () => {
    // 60% of $3.99 is 239.4 cents. Claiming 240 would mean the bar shows money
    // that isn't there.
    expect(fundCutCents(399)).toBe(239);
  });

  it("follows the env override", () => {
    process.env.FUND_SHARE_PCT = "50";
    expect(sharePct()).toBe(50);
    expect(fundCutCents(1000)).toBe(500);
  });

  it("never exceeds the whole payment", () => {
    process.env.FUND_SHARE_PCT = "500";
    expect(fundCutCents(1000)).toBe(1000);
  });

  it("treats a refund or a zero as nothing", () => {
    expect(fundCutCents(0)).toBe(0);
    expect(fundCutCents(-500)).toBe(0);
  });
});

describe("points", () => {
  it("gives a point per dollar", () => {
    expect(pointsFor(100)).toBe(1);
    expect(pointsFor(3999)).toBe(39);
  });

  it("ignores the change — no fractional votes", () => {
    expect(pointsFor(199)).toBe(1);
    expect(pointsFor(99)).toBe(0);
  });

  it("caps, so the richest wallet can't buy the outcome", () => {
    // The cap is the whole reason this isn't just an auction.
    expect(pointsFor(100_000_00)).toBe(pointCap());
  });

  it("respects a configured cap", () => {
    process.env.FUND_POINT_CAP = "10";
    expect(pointsFor(50_00)).toBe(10);
  });

  it("gives nothing for nothing", () => {
    expect(pointsFor(0)).toBe(0);
    expect(pointsFor(-100)).toBe(0);
  });
});

describe("defaults", () => {
  it("falls back to sane numbers when nothing is configured", () => {
    expect(goalCents()).toBe(25_000_000); // $250,000
    expect(sharePct()).toBe(60);
    expect(pointCap()).toBe(1_000);
  });

  it("ignores junk env values rather than producing a zero goal", () => {
    process.env.FUND_GOAL_CENTS = "not-a-number";
    expect(goalCents()).toBe(25_000_000);
  });
});

describe("scaled for a feature, not a short", () => {
  it("aims at the floor of a real feature budget", () => {
    // $250,000 — the bottom of the $250k-$1M range, so the first picture is
    // reachable rather than aspirational.
    expect(goalCents()).toBe(25_000_000);
  });

  it("caps votes exactly where the credit tiers begin", () => {
    // $1,000 buys a Co-Producer credit and the last vote that counts. Below
    // that, votes track money one for one; above it you're buying credits and
    // access, not influence. The two ladders meeting makes the rule legible.
    expect(pointCap()).toBe(1_000);
    expect(pointsFor(100_000)).toBe(1_000);
    expect(pointsFor(2_500_000)).toBe(1_000);
  });
});

describe("currency on the ledger", () => {
  it("defaults to the fund's own currency", () => {
    // Every charge to date is USD — the checkout hardcodes it — so a row with
    // no currency stated is USD as a matter of fact, not assumption.
    expect(fundCurrency()).toBe("usd");
  });

  it("is lowercase, matching Stripe", () => {
    // Stripe reports ISO 4217 lowercase, and the CHECK constraint in migration
    // 0024 enforces the same. A comparison against "USD" would silently never
    // match and quietly exclude every row from the bar.
    expect(fundCurrency()).toBe(fundCurrency().toLowerCase());
  });

  it("is the currency the checkout actually charges in", () => {
    // These two drifting apart is the failure that matters: the bar would
    // scope to one currency while every charge landed in another, and the
    // total would read zero forever with money in the account.
    expect(CHECKOUT_CURRENCY).toBe(fundCurrency());
  });
});
