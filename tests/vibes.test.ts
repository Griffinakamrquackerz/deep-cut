import { describe, expect, it } from "vitest";
import { VIBES, vibeByKey } from "@/lib/vibes";
import { TMDB_GENRE_IDS } from "@/lib/tmdb";
import { RecBatchInput } from "@/lib/schemas";

const REAL_GENRE_IDS = new Set(Object.values(TMDB_GENRE_IDS));

describe("vibes catalog", () => {
  it("has unique keys", () => {
    const keys = VIBES.map((v) => v.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every vibe maps to real TMDB genre ids", () => {
    for (const v of VIBES) {
      expect(v.genreIds.length).toBeGreaterThan(0);
      for (const id of v.genreIds) {
        expect(REAL_GENRE_IDS.has(id)).toBe(true);
      }
    }
  });

  it("every vibe carries a label, emoji, and steering hint", () => {
    for (const v of VIBES) {
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.emoji.length).toBeGreaterThan(0);
      expect(v.hint.length).toBeGreaterThan(20);
    }
  });

  it("vibeByKey resolves keys and rejects unknowns", () => {
    expect(vibeByKey("scare")?.label).toBe("Scare me");
    expect(vibeByKey("nope")).toBeNull();
    expect(vibeByKey(null)).toBeNull();
    expect(vibeByKey(undefined)).toBeNull();
  });
});

describe("RecBatchInput vibe field", () => {
  it("accepts a valid vibe key", () => {
    const parsed = RecBatchInput.safeParse({ vibe: "laugh" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.vibe).toBe("laugh");
  });

  it("accepts null / omitted vibe", () => {
    expect(RecBatchInput.safeParse({ vibe: null }).success).toBe(true);
    expect(RecBatchInput.safeParse({}).success).toBe(true);
  });

  it("rejects an unknown vibe key", () => {
    expect(RecBatchInput.safeParse({ vibe: "yolo" }).success).toBe(false);
  });
});
