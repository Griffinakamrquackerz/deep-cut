import { afterEach, describe, expect, it, vi } from "vitest";
import { orderedLookahead } from "@/lib/ordered-lookahead";

// A controlled I/O model, not a prediction of production latency. Both runs
// use the same graph, exclusions, 4 workers, 8 slots and 100ms lookup latency.
// The sole variable is skipping enrichment for an ID already excluded.
afterEach(() => vi.useRealTimers());
it("avoids excluded lookups with identical ordered selections in a controlled replay", async () => {
  vi.useFakeTimers();
  const graph = Array.from({ length: 68 }, (_, id) => id);
  const excluded = new Set(graph.slice(0, 46));
  async function replay(skipExcluded: boolean) {
    let calls = 0;
    const start = Date.now();
    const source = orderedLookahead(graph, 4, 8, async (id) => {
      if (skipExcluded && excluded.has(id)) return null;
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 100));
      return id;
    });
    const selected: number[] = [];
    for await (const { item, result } of source.results) {
      if (excluded.has(item) || result == null || result < 65) continue;
      selected.push(result);
      if (selected.length === 3) break;
    }
    return { calls, ms: Date.now() - start, selected };
  }
  const beforePromise = replay(false);
  await vi.runAllTimersAsync();
  const before = await beforePromise;
  const afterPromise = replay(true);
  await vi.runAllTimersAsync();
  const after = await afterPromise;
  expect(before).toEqual({ calls: 68, ms: 1700, selected: [65, 66, 67] });
  expect(after).toEqual({ calls: 22, ms: 600, selected: before.selected });
});
