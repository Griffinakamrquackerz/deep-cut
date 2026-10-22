/** Fetch bounded batches concurrently, but yield in input order. Early exit starts no further batch. */
export async function* orderedBatches<T, R>(
  items: readonly T[],
  size: number,
  load: (item: T) => Promise<R>,
): AsyncGenerator<{ item: T; result: R }> {
  if (!Number.isInteger(size) || size < 1) throw new Error("Invalid batch size");
  for (let offset = 0; offset < items.length; offset += size) {
    const batch = items.slice(offset, offset + size);
    const results = await Promise.all(batch.map(load));
    for (let i = 0; i < batch.length; i++) {
      yield { item: batch[i], result: results[i] };
    }
  }
}
