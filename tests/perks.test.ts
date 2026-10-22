import { describe, it, expect } from "vitest";
import { PERKS, tierFor, tiersUnlocked, nextTier } from "@/lib/perks";
import { shuffleForViewer } from "@/lib/voting";

describe("perk tiers", () => {
  it("is ordered cheapest first, with no duplicate thresholds", () => {
    // The tier functions all assume ascending order.
    const mins = PERKS.map((p) => p.minCents);
    expect(mins).toEqual([...mins].sort((a, b) => a - b));
    expect(new Set(mins).size).toBe(mins.length);
  });

  it("five dollars clears the floor", () => {
    expect(tierFor(500)?.name).toBe("Ticket Holder");
  });

  it("gives nothing below the floor", () => {
    expect(tierFor(499)).toBeNull();
    expect(tierFor(0)).toBeNull();
  });

  it("lands on the highest tier reached, not the nearest", () => {
    // $600 is past Patron ($500) but short of Co-Producer ($1,000).
    expect(tierFor(60_000)?.name).toBe("Patron");
  });

  it("keeps every tier below it — perks accumulate", () => {
    const names = tiersUnlocked(100_000).map((p) => p.name);
    expect(names).toContain("Backer");
    expect(names).toContain("Co-Producer");
    expect(names).not.toContain("Associate Producer");
  });

  it("says how far the next tier is", () => {
    const n = nextTier(90_000); // $900
    expect(n?.perk.name).toBe("Co-Producer");
    expect(n?.centsAway).toBe(10_000); // $100 short
  });

  it("has nothing left to reach at the top", () => {
    expect(nextTier(10_000_000)).toBeNull();
  });

  it("only gives a producing credit where a real budget could justify one", () => {
    // Handing out Executive Producer for $500 on a million-dollar picture makes
    // the credit worthless, and the people who actually financed it notice.
    for (const p of PERKS) {
      if (p.credit === "Co-Producer") expect(p.minCents).toBeGreaterThanOrEqual(100_000);
      if (p.credit === "Associate Producer") expect(p.minCents).toBeGreaterThanOrEqual(500_000);
      if (p.credit === "Executive Producer") expect(p.minCents).toBeGreaterThanOrEqual(2_000_000);
    }
  });

  it("keeps scaling well past the vote cap", () => {
    // The design: the vote cap is a ceiling on power, not on recognition, so
    // tiers above it must still exist and still add things.
    const above = PERKS.filter((p) => p.minCents > 100_000);
    expect(above.length).toBeGreaterThan(0);
    for (const p of above) expect(p.adds.length).toBeGreaterThan(0);
  });
});

describe("ballot order", () => {
  const pitches = ["a", "b", "c", "d", "e"].map((id) => ({ id }));

  it("gives the same viewer the same order every time", () => {
    // A ballot that reshuffles while you're reading it is unusable.
    const once = shuffleForViewer(pitches, "viewer-1").map((p) => p.id);
    const twice = shuffleForViewer(pitches, "viewer-1").map((p) => p.id);
    expect(once).toEqual(twice);
  });

  it("gives different viewers different orders", () => {
    // Whatever is printed first wins votes it didn't earn.
    const a = shuffleForViewer(pitches, "viewer-1").map((p) => p.id).join();
    const b = shuffleForViewer(pitches, "viewer-2").map((p) => p.id).join();
    expect(a).not.toBe(b);
  });

  it("keeps every pitch exactly once", () => {
    const out = shuffleForViewer(pitches, "x").map((p) => p.id);
    expect(out.sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("doesn't mutate the input", () => {
    const input = [...pitches];
    shuffleForViewer(input, "x");
    expect(input.map((p) => p.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
});

// ── The words this ladder must never use ──
//
// The project states the rule in its own source (FundBar.tsx): "Words that are
// not used here, and shouldn't be: invest, equity, share, stake, returns,
// stock." Reward-based crowdfunding is ordinary and legal precisely because of
// that line — a contribution that reads as buying a piece of the film is a
// security, whatever the disclaimer four screens away says.
//
// It got broken once. The $25,000 tier read "A serious share of a feature"
// with a computed "10 percent of a feature" underneath, and shipped publicly
// on /fund. A comment can't enforce a vocabulary; a test can.
describe("perk copy stays on the reward side of the line", () => {
  const FORBIDDEN = [
    "share of",
    "shares",
    "equity",
    "stake in",
    "invest",
    "investor",
    "investment",
    "returns",
    "stock",
    "profit",
    "back end",
    "points on",
    "ownership",
    "own a piece",
  ];

  /** Every string a member can actually read off the ladder. */
  function allCopy(): string[] {
    const out: string[] = [];
    for (const p of PERKS) {
      out.push(p.name, p.line ?? "");
      if (typeof p.lineOf === "function") out.push(p.lineOf(25_000_000));
      out.push(...(p.adds ?? []));
    }
    return out.filter(Boolean);
  }

  it("uses none of the ownership words", () => {
    for (const text of allCopy()) {
      const lower = text.toLowerCase();
      for (const word of FORBIDDEN) {
        expect(lower.includes(word), `"${text}" contains "${word}"`).toBe(false);
      }
    }
  });

  it("still states the magnitude at the top tier", () => {
    // The fix must not have quietly deleted the point. The top tier should
    // still tell somebody how much of the film their money covers.
    const top = PERKS[PERKS.length - 1];
    const line = typeof top.lineOf === "function" ? top.lineOf(25_000_000) : (top.line ?? "");
    expect(line).toMatch(/percent|th of/);
    expect(line.toLowerCase()).toContain("funding");
  });
});
