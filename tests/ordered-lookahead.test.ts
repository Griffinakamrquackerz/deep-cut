import { describe, expect, it } from "vitest";
import { orderedLookahead } from "@/lib/ordered-lookahead";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

describe("orderedLookahead", () => {
  it("reuses free workers without waiting for a slow batch peer, but yields in order", async () => {
    const first = deferred<number>();
    const started: number[] = [];
    const source = orderedLookahead([1, 2, 3, 4, 5], 2, 4, async (n) => {
      started.push(n);
      return n === 1 ? first.promise : n;
    });
    await flush();
    expect(started).toEqual([1, 2, 3, 4]);
    expect(source.stats.completed).toBe(3);
    first.resolve(1);
    const output: number[] = [];
    for await (const { result } of source.results) output.push(result);
    expect(output).toEqual([1, 2, 3, 4, 5]);
  });

  it("does not wait for the rest of the buffer before yielding its head", async () => {
    const slow = deferred<number>();
    const source = orderedLookahead([1, 2], 2, 2, async (n) => n === 1 ? n : slow.promise);
    expect(await source.results.next()).toMatchObject({ value: { result: 1 } });
    await source.results.return(undefined);
    slow.resolve(2);
    await flush();
  });

  it("bounds concurrency and speculative work, and stops refilling after early exit", async () => {
    const pending = Array.from({ length: 20 }, () => deferred<number>());
    let active = 0;
    let peak = 0;
    const source = orderedLookahead(pending.map((_, i) => i), 4, 8, async (i) => {
      peak = Math.max(peak, ++active);
      try { return await pending[i].promise; } finally { active--; }
    });
    await flush();
    expect(source.stats.started).toBe(4);
    for (let i = 0; i < 8; i++) { pending[i].resolve(i); await flush(); }
    expect(source.stats.started).toBe(8);
    expect(peak).toBe(4);
    for await (const { item } of source.results) { expect(item).toBe(0); break; }
    await flush();
    expect(source.stats.started).toBe(8);
    expect(source.stats.consumed).toBe(1);
  });

  it("handles speculative rejections after close without scheduling more work", async () => {
    const pending = deferred<number>();
    const source = orderedLookahead([1, 2, 3], 1, 2, () => pending.promise);
    await flush();
    source.close();
    pending.reject(new Error("unused lookup"));
    await flush();
    expect(source.stats.started).toBe(1);
    expect(await source.results.next()).toMatchObject({ done: true });
  });

  it("propagates a consumed failure and closes the source", async () => {
    const source = orderedLookahead([1, 2], 1, 1, async () => { throw new Error("lookup"); });
    await expect(source.results.next()).rejects.toThrow("lookup");
    expect(source.stats.started).toBe(1);
  });

  it("handles empty input and rejects invalid bounds", async () => {
    const source = orderedLookahead([], 4, 8, async () => 1);
    expect(await source.results.next()).toMatchObject({ done: true });
    expect(source.stats.started).toBe(0);
    expect(() => orderedLookahead([], 0, 8, async () => 1)).toThrow("Invalid lookahead bounds");
    expect(() => orderedLookahead([], 4, 3, async () => 1)).toThrow("Invalid lookahead bounds");
  });
});
