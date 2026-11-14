import { describe, expect, it } from "vitest";
import { repeatExclusionTitles } from "@/lib/repeat-exclusions";

const head = Array.from({ length: 120 }, (_, i) => `Recent ${i} (2000)`);
const log = (recs: unknown[]) => ({ raw: JSON.stringify({ recs }) });
const film = (title: string, year = 2000) => ({ title, year });

describe("repeat exclusion prompt coverage", () => {
  it("preserves the original head and requires two distinct completions", () => {
    const history = [...head, "Old (2000)", "Once (2000)"];
    expect(repeatExclusionTitles(history, [log([film("Old"), film("Old"), film("Once")])])).toEqual(head);
    expect(repeatExclusionTitles(history, [log([film("Old"), film("Once")]), log([film("Old")])]))
      .toEqual([...head, "Old (2000)"]);
  });

  it("never creates exclusions for unseen proposals or a different remake", () => {
    const history = [...head, "Remake (1980)", "Known (2000)"];
    const raw = log([film("Unseen"), film("Remake", 2020), film("Known"), film("Recent 0")]);
    expect(repeatExclusionTitles(history, [raw, raw])).toEqual([...head, "Known (2000)"]);
  });

  it("matches casing and whitespace but returns the canonical history label", () => {
    const history = [...head, "Old Film (2000)"];
    expect(repeatExclusionTitles(history, [log([film(" OLD   film ")]), log([film("old film")])]))
      .toEqual([...head, "Old Film (2000)"]);
  });

  it("skips malformed logs and invalid candidates without discarding good logs", () => {
    const valid = log([film("Old")]);
    const logs = [
      valid, { raw: "broken {" }, { raw: null }, { raw: '{"recs":{}}' },
      { raw: '{"recs":null}' }, { raw: "{}" },
      log([null, false, {}, { title: "Old", year: "2000" }, { title: "Old", year: null }, film("Old", 0)]),
      { raw: `\u0060\u0060\u0060json\n${valid.raw}\n\u0060\u0060\u0060` },
    ];
    expect(repeatExclusionTitles([...head, "Old (2000)"], logs)).toEqual([...head, "Old (2000)"]);
  });

  it("caps additions at 40, ranks frequency first and uses recency for ties", () => {
    const candidates = Array.from({ length: 50 }, (_, i) => film(`Old ${i}`));
    const history = [...head, ...candidates.map(({ title }) => `${title} (2000)`)];
    const logs = [log([candidates[49], candidates[48]]), log(candidates), log(candidates), log([candidates[48]])];
    const result = repeatExclusionTitles(history, logs);
    expect(result).toHaveLength(160);
    expect(result.slice(0, 120)).toEqual(head);
    expect(result.slice(120, 123)).toEqual(["Old 48 (2000)", "Old 49 (2000)", "Old 0 (2000)"]);
    expect(new Set(result).size).toBe(160);
  });

  it("keeps short or empty history unchanged", () => {
    const logs = [log([film("Unknown")]), log([film("Unknown")])];
    expect(repeatExclusionTitles([], logs)).toEqual([]);
    expect(repeatExclusionTitles(["Known (2000)"], logs)).toEqual(["Known (2000)"]);
  });
});
