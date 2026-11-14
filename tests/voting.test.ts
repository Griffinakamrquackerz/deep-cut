import { describe, expect, it } from "vitest";
import { shuffleForViewer } from "../src/lib/voting";
import { pointsFor, pointCap } from "../src/lib/fund";
import { countPile, showcaseSlots, type Submission } from "../src/lib/submissions";

// The ballot's two load-bearing rules, tested where they can be tested without
// a database: the order pitches appear in, and the budget somebody is allowed
// to spend. Everything else in castBallot is a write path and is checked by the
// server's own re-derivation rather than here.

const slate = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `pitch-${i}`, title: `Film ${i}` }));

describe("ballot order", () => {
  it("is stable for one viewer", () => {
    // A ballot that reshuffles between renders would move a pitch out from
    // under somebody's thumb mid-decision.
    const items = slate(6);
    const a = shuffleForViewer(items, "user-1").map((p) => p.id);
    const b = shuffleForViewer(items, "user-1").map((p) => p.id);
    expect(a).toEqual(b);
  });

  it("differs between viewers", () => {
    // The whole point: position on a ballot wins votes it didn't earn, so no
    // two people should be reading the same running order.
    const items = slate(8);
    const seen = new Set(
      ["a", "b", "c", "d", "e", "f"].map((s) => shuffleForViewer(items, s).map((p) => p.id).join()),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it("keeps every pitch exactly once", () => {
    // A shuffle that dropped or duplicated a pitch would silently remove a
    // director from the running.
    const items = slate(10);
    const out = shuffleForViewer(items, "user-9");
    expect(out).toHaveLength(items.length);
    expect(new Set(out.map((p) => p.id)).size).toBe(items.length);
    for (const p of items) expect(out).toContainEqual(p);
  });

  it("does not mutate the slate it was given", () => {
    const items = slate(5);
    const before = items.map((p) => p.id);
    shuffleForViewer(items, "user-x");
    expect(items.map((p) => p.id)).toEqual(before);
  });

  it("handles an empty and a single-pitch slate", () => {
    expect(shuffleForViewer([], "u")).toEqual([]);
    expect(shuffleForViewer(slate(1), "u")).toHaveLength(1);
  });
});

describe("vote budget", () => {
  it("is a dollar per vote under the cap", () => {
    expect(pointsFor(0)).toBe(0);
    expect(pointsFor(100)).toBe(1);
    expect(pointsFor(4_000)).toBe(40);
  });

  it("rounds down rather than up", () => {
    // 99 cents is not a vote. Rounding up would let a stack of sub-dollar
    // contributions mint votes the ledger never took money for.
    expect(pointsFor(99)).toBe(0);
    expect(pointsFor(199)).toBe(1);
  });

  it("stops at the cap however much is given", () => {
    const cap = pointCap();
    expect(pointsFor(cap * 100)).toBe(cap);
    expect(pointsFor(cap * 100 * 50)).toBe(cap);
  });

  it("never returns a negative budget", () => {
    // Corrections are entered as negative rows in the ledger, so a refunded
    // member can total below zero. That must read as no votes, not as a
    // negative budget the ballot would do something strange with.
    expect(pointsFor(-5_000)).toBe(0);
  });
});

describe("the showcase cap", () => {
  it("defaults to nine", () => {
    // Nine because a ballot has to be readable in one sitting. Every pitch
    // carries a deck, a reel and a synopsis; thirty of those gets skimmed, and
    // a skimmed ballot is won by whatever summarises best rather than by the
    // best film.
    expect(showcaseSlots()).toBe(9);
  });

  it("counts the pile by status and reports slots left", () => {
    const sub = (status: Submission["status"], i: number) =>
      ({ id: String(i), status }) as Submission;
    const pile = [
      sub("new", 1),
      sub("new", 2),
      sub("read", 3),
      sub("passed", 4),
      ...Array.from({ length: 4 }, (_, i) => sub("showcased", 10 + i)),
    ];
    const c = countPile(pile);
    expect(c.new).toBe(2);
    expect(c.read).toBe(1);
    expect(c.passed).toBe(1);
    expect(c.showcased).toBe(4);
    expect(c.total).toBe(8);
    expect(c.slotsLeft).toBe(5);
  });

  it("never reports negative slots left", () => {
    // A slate that somehow ran over its cap should read as full, not as
    // "minus two slots left" — which would render as a nonsense number and,
    // worse, might read as truthy somewhere.
    const over = Array.from({ length: 12 }, (_, i) => ({ id: String(i), status: "showcased" }) as Submission);
    expect(countPile(over).slotsLeft).toBe(0);
  });
});
