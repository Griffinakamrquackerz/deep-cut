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

  it("defaults the obscurity floor to niche-or-deeper", () => {
    const parsed = RecBatchInput.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.obscurityMin).toBe(3);
  });
});

describe("genre-defining vibes stay inside their genre", () => {
  // "Scare me" carried Thriller(53) in BOTH its pull and its gate, and the gate
  // accepts a film matching ANY of requireGenreIds — so a pure thriller passed
  // as horror. Dealt live under "Scare me": K.G.F: Chapter 1
  // (Action/Thriller/Adventure/Crime, via the LLM round) and The Substitute
  // (Action/Crime/Drama/Thriller, via the loved-similar round).
  it("Scare me is horror-only — no thriller in the pull or the gate", () => {
    const scare = vibeByKey("scare")!;
    expect(scare.genreIds).toEqual([TMDB_GENRE_IDS.Horror]);
    expect(scare.requireGenreIds).toEqual([TMDB_GENRE_IDS.Horror]);
    expect(scare.rollGenreIds).toEqual([TMDB_GENRE_IDS.Horror]);
    const everyScareGenre = [
      ...scare.genreIds,
      ...(scare.requireGenreIds ?? []),
      ...(scare.rollGenreIds ?? []),
    ];
    expect(everyScareGenre).not.toContain(TMDB_GENRE_IDS.Thriller);
  });

  it("Swoon is romance-only — a drama pull the gate rejects is wasted budget", () => {
    const swoon = vibeByKey("swoon")!;
    expect(swoon.genreIds).toEqual([TMDB_GENRE_IDS.Romance]);
    expect(swoon.requireGenreIds).toEqual([TMDB_GENRE_IDS.Romance]);
    const everySwoonGenre = [
      ...swoon.genreIds,
      ...(swoon.requireGenreIds ?? []),
      ...(swoon.rollGenreIds ?? []),
    ];
    expect(everySwoonGenre).not.toContain(TMDB_GENRE_IDS.Drama);
  });

  // A gate narrower than the pull can only ever throw away pages the Discover
  // budget already paid for (that was Swoon: pulled Drama, gated on Romance).
  it("a vibe's gate is never narrower than the genres it pulls", () => {
    for (const v of VIBES) {
      if (!v.requireGenreIds?.length) continue;
      for (const id of v.requireGenreIds) {
        expect(v.genreIds, `${v.key} requires ${id} but never pulls it`).toContain(id);
      }
    }
  });

  it("every requireGenreIds entry is a real TMDB genre id", () => {
    for (const v of VIBES) {
      for (const id of v.requireGenreIds ?? []) {
        expect(REAL_GENRE_IDS.has(id), `${v.key} carries a bogus genre id ${id}`).toBe(true);
      }
    }
  });

  it("Melt my brain excludes comedy while allowing cross-genre mind-benders", () => {
    const mind = vibeByKey("mind")!;
    expect(mind.avoidGenreIds).toContain(TMDB_GENRE_IDS.Comedy);
    expect(mind.requireGenreIds).toBeUndefined();
  });
});
