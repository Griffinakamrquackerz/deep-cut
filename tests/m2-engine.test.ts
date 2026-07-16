import { describe, expect, it } from "vitest";
import { obscurityFromVoteCount, obscurityDots } from "@/lib/obscurity";
import { parseStrictJson } from "@/lib/ai";
import { RecCandidatesOutput, TasteProfileOutput } from "@/lib/schemas";

describe("M2 — obscurity scoring", () => {
  it("buckets vote counts per spec", () => {
    expect(obscurityFromVoteCount(600_000)).toBe(1);
    expect(obscurityFromVoteCount(250_000)).toBe(2);
    expect(obscurityFromVoteCount(50_000)).toBe(3);
    expect(obscurityFromVoteCount(10_000)).toBe(4);
    expect(obscurityFromVoteCount(500)).toBe(5);
  });

  it("renders ◆◆◆◇◇ dots", () => {
    expect(obscurityDots(3)).toBe("◆◆◆◇◇");
    expect(obscurityDots(5)).toBe("◆◆◆◆◆");
    expect(obscurityDots(0)).toBe("◆◇◇◇◇"); // clamped
  });
});

describe("M2 — strict JSON parsing of Claude output", () => {
  it("parses a clean taste profile", () => {
    const raw = JSON.stringify({
      threads: [
        { title: "Sincere failure", line: "You root for people who swing big and miss." },
        { title: "Hangout movies", line: "Dialogue is the plot and you're happy about it." },
        { title: "Competence porn", line: "You love watching people be great at their jobs." },
      ],
    });
    const out = parseStrictJson(raw, TasteProfileOutput);
    expect(out.threads).toHaveLength(3);
  });

  it("tolerates prose/markdown around the JSON object", () => {
    const raw =
      'Here are the threads:\n```json\n{"threads":[{"title":"A","line":"a"},{"title":"B","line":"b"},{"title":"C","line":"c"}]}\n```\nEnjoy!';
    const out = parseStrictJson(raw, TasteProfileOutput);
    expect(out.threads.map((t) => t.title)).toEqual(["A", "B", "C"]);
  });

  it("rejects genre-count violations (2 threads)", () => {
    const raw = JSON.stringify({ threads: [{ title: "A", line: "a" }, { title: "B", line: "b" }] });
    expect(() => parseStrictJson(raw, TasteProfileOutput)).toThrow();
  });

  it("parses rec candidates and rejects invented shapes", () => {
    const good = JSON.stringify({
      recs: [
        { title: "Living in Oblivion", year: 1995, reason: "Because you loved The Room → film-set chaos.", obscurity_guess: 4 },
      ],
    });
    expect(parseStrictJson(good, RecCandidatesOutput).recs[0].year).toBe(1995);

    const bad = JSON.stringify({ recs: [{ title: "", year: 1500, reason: "", obscurity_guess: 9 }] });
    expect(() => parseStrictJson(bad, RecCandidatesOutput)).toThrow();
  });

  it("throws when there is no JSON at all", () => {
    expect(() => parseStrictJson("I cannot help with that.", TasteProfileOutput)).toThrow();
  });
});
