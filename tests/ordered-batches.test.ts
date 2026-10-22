import { describe, expect, it } from "vitest";
import { orderedBatches } from "@/lib/ordered-batches";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("orderedBatches — bounded concurrent fetching in input order", () => {
  it("yields in input order even when later items resolve first", async () => {
    const out: number[] = [];
    for await (const { result } of orderedBatches([1, 2, 3, 4, 5], 5, async (n) => {
      // Item 5 settles first, item 1 last — output must still be input order.
      await delay((6 - n) * 5);
      return n * 10;
    })) {
      out.push(result);
    }
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });

  it("never runs more than `size` lookups concurrently", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 10 }, (_, i) => i + 1);
    const seen: number[] = [];
    for await (const { item } of orderedBatches(items, 4, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await delay(5);
      inFlight--;
      return n;
    })) {
      seen.push(item);
    }
    expect(peak).toBe(4);
    expect(seen).toEqual(items); // every item yielded exactly once, none dropped
  });

  it("starts no further batches once the consumer exits early", async () => {
    const started: number[] = [];
    const items = Array.from({ length: 12 }, (_, i) => i + 1);
    for await (const { item } of orderedBatches(items, 4, async (n) => {
      started.push(n);
      await delay(1);
      return n;
    })) {
      if (item === 4) break; // Exit exactly at a batch boundary.
    }
    expect(started).toEqual([1, 2, 3, 4]);
  });

  it("yields nothing and never calls load for empty input", async () => {
    let calls = 0;
    const out: number[] = [];
    for await (const { item } of orderedBatches([], 4, async (n) => {
      calls++;
      return n;
    })) {
      out.push(item);
    }
    expect(out).toEqual([]);
    expect(calls).toBe(0);
  });

  it("rejects a non-positive batch size", async () => {
    const gen = orderedBatches([1, 2], 0, async (n) => n);
    await expect(gen.next()).rejects.toThrow("Invalid batch size");
  });
});