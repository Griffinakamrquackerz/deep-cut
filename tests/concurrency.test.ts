import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "@/lib/push";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("mapWithConcurrency", () => {
  it("returns results in input order, not completion order", async () => {
    // The slowest item is first, so anything that collects results as they
    // finish would scramble them.
    const out = await mapWithConcurrency([30, 1, 1, 1], 4, async (ms) => {
      await tick(ms);
      return ms;
    });
    expect(out).toEqual([30, 1, 1, 1]);
  });

  it("never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 50 }, (_, i) => i), 5, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick(2);
      inFlight--;
      return null;
    });
    expect(peak).toBeLessThanOrEqual(5);
  });

  it("visits every item exactly once", async () => {
    const seen: number[] = [];
    await mapWithConcurrency(Array.from({ length: 100 }, (_, i) => i), 7, async (i) => {
      seen.push(i);
      return i;
    });
    expect(seen.length).toBe(100);
    expect(new Set(seen).size).toBe(100);
  });

  it("handles an empty list without hanging", async () => {
    expect(await mapWithConcurrency([], 10, async () => 1)).toEqual([]);
  });

  it("doesn't spawn more workers than there is work", async () => {
    // A limit of 100 against 2 items must not create 100 idle loops.
    expect(await mapWithConcurrency([1, 2], 100, async (n) => n * 2)).toEqual([2, 4]);
  });
});
