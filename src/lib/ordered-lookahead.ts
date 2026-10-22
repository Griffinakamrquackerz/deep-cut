/** Eager, bounded fetching with ordered consumption. Only fetching is concurrent. */
export function orderedLookahead<T, R>(
  items: readonly T[],
  concurrency: number,
  capacity: number,
  load: (item: T) => Promise<R>,
) {
  if (!Number.isInteger(concurrency) || concurrency < 1 ||
      !Number.isInteger(capacity) || capacity < concurrency) {
    throw new Error("Invalid lookahead bounds");
  }
  type Outcome = { ok: true; result: R } | { ok: false; error: unknown };
  const slots = new Map<number, Promise<Outcome>>();
  const stats = { started: 0, completed: 0, consumed: 0, waitMs: 0 };
  let active = 0;
  let released = 0;
  let stopped = false;

  function close() {
    stopped = true;
    slots.clear();
  }

  function pump() {
    while (!stopped && active < concurrency && stats.started < items.length &&
           stats.started - released < capacity) {
      const index = stats.started++;
      active++;
      // Always settle to a value: speculative failures must not become unhandled
      // rejections if the consumer stops before reaching this slot.
      const task = Promise.resolve().then(() => load(items[index])).then(
        (result): Outcome => ({ ok: true, result }),
        (error: unknown): Outcome => ({ ok: false, error }),
      );
      slots.set(index, task);
      void task.then(() => {
        active--;
        stats.completed++;
        pump();
      });
    }
  }

  async function* consume(): AsyncGenerator<{ item: T; result: R }> {
    try {
      for (let index = 0; index < items.length && !stopped; index++) {
        const start = performance.now();
        const outcome = await slots.get(index)!;
        stats.waitMs += performance.now() - start;
        if (stopped) return;
        if (!outcome.ok) throw outcome.error;
        stats.consumed++;
        yield { item: items[index], result: outcome.result };
        // Release only when the consumer asks for another item. A break at the
        // target must not itself schedule another speculative lookup.
        slots.delete(index);
        released++;
        pump();
      }
    } finally {
      close();
    }
  }

  pump();
  // Explicit close also handles a pipeline whose iterator is never entered.
  return { results: consume(), close, stats };
}
