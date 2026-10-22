// Prompt coverage only: never create an exclusion from a model claim. Repeated
// proposals must match a title/year in the member's actual exclusion history.
const HEAD_CAP = 120;
const REPEAT_CAP = 40;

const keyFor = (title: string) => title.trim().replace(/\s+/g, " ").toLowerCase();

/** Preserve the existing head, then append up to 40 repeatedly proposed films. */
export function repeatExclusionTitles(
  history: string[],
  logs: ReadonlyArray<{ raw?: unknown }>,
): string[] {
  const head = history.slice(0, HEAD_CAP);
  const known = new Map(history.map((title) => [keyFor(title), title]));
  const included = new Set(head.map(keyFor));
  const counts = new Map<string, { count: number; firstSeen: number }>();

  logs.forEach(({ raw }, index) => {
    if (typeof raw !== "string") return;
    let parsed: unknown;
    try {
      // Stored completions may include a Markdown fence around the JSON.
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start < 0 || end <= start) return;
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object" || !("recs" in parsed) || !Array.isArray(parsed.recs)) return;
    const seen = new Set<string>();
    for (const candidate of parsed.recs) {
      if (!candidate || typeof candidate !== "object") continue;
      const { title, year } = candidate;
      if (typeof title !== "string" || !title.trim()) continue;
      // Do not conflate remakes or guess which film an invalid year means.
      if (typeof year !== "number" || !Number.isInteger(year) || year < 1000 || year > 9999) continue;
      const key = keyFor(`${title.trim()} (${year})`);
      if (!known.has(key) || included.has(key) || seen.has(key)) continue;
      seen.add(key); // duplicate entries in one completion count only once
      const entry = counts.get(key);
      if (entry) entry.count++;
      else counts.set(key, { count: 1, firstSeen: index });
    }
  });

  const repeats = [...counts.entries()]
    .filter(([, entry]) => entry.count >= 2)
    .sort(([, a], [, b]) => b.count - a.count || a.firstSeen - b.firstSeen)
    .slice(0, REPEAT_CAP)
    .map(([key]) => known.get(key)!);
  return [...head, ...repeats];
}
