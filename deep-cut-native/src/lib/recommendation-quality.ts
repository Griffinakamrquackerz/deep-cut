import type { Rec } from "./types";

/** Reorder each existing batch softly without moving older batches above newer ones. */
export function byRecommendationPreference(items: Rec[], target: number): Rec[] {
  const groups = new Map<string, Rec[]>();
  for (const item of items) {
    const key = `${item.status}:${item.batch}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap((group) =>
    group
      .map((item, index) => ({
        item,
        index,
        rank: (item.gem ?? 0) * 3 + (2 - Math.abs(item.obscurity - target)),
      }))
      .sort((a, b) => b.rank - a.rank || a.index - b.index)
      .map(({ item }) => item),
  );
}
