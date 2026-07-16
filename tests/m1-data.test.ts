import { describe, expect, it } from "vitest";
import { STARTER_GRID } from "@/lib/starter-grid";
import { mapTmdbProviders, SERVICES } from "@/lib/services";
import { normalizeTitle, titleYearMatch } from "@/lib/tmdb";

describe("M1 — starter grid", () => {
  it("has a broad shelf with unique tmdb ids", () => {
    expect(STARTER_GRID.length).toBeGreaterThanOrEqual(60);
    expect(new Set(STARTER_GRID.map((f) => f.tmdbId)).size).toBe(STARTER_GRID.length);
  });

  it("spans eras from pre-1970 through the 2020s", () => {
    expect(STARTER_GRID.some((f) => f.year < 1970)).toBe(true);
    expect(STARTER_GRID.some((f) => f.year >= 2020)).toBe(true);
  });

  it("is not just a greatest-of-all-time wall — at least a third is 2014+", () => {
    const recent = STARTER_GRID.filter((f) => f.year >= 2014).length;
    expect(recent).toBeGreaterThanOrEqual(Math.floor(STARTER_GRID.length / 3));
  });
});

describe("M1 — provider mapping", () => {
  it("maps known TMDB provider ids to our services", () => {
    expect(mapTmdbProviders([8])).toEqual(["netflix"]);
    expect(mapTmdbProviders([8, 337, 99])).toEqual(["netflix", "disney", "shudder"]);
  });

  it("ignores unknown provider ids", () => {
    expect(mapTmdbProviders([999999])).toEqual([]);
  });

  it("covers all 12 spec services", () => {
    expect(SERVICES).toHaveLength(12);
  });
});

describe("M1 — fuzzy title+year resolution", () => {
  it("normalizes articles, case, punctuation, diacritics", () => {
    expect(normalizeTitle("The Godfather")).toBe(normalizeTitle("godfather"));
    expect(normalizeTitle("Amélie")).toBe(normalizeTitle("amelie"));
    expect(normalizeTitle("Se7en!")).toBe("se7en");
  });

  it("matches within ±1 year", () => {
    const result = { title: "Living in Oblivion", year: 1995 };
    expect(titleYearMatch({ title: "Living in Oblivion", year: 1995 }, result)).toBe(true);
    expect(titleYearMatch({ title: "living in oblivion", year: 1996 }, result)).toBe(true);
    expect(titleYearMatch({ title: "Living in Oblivion", year: 1998 }, result)).toBe(false);
  });

  it("rejects different films (LLM hallucination guard)", () => {
    expect(
      titleYearMatch(
        { title: "The Imaginary Sequel That Does Not Exist", year: 1995 },
        { title: "Living in Oblivion", year: 1995 },
      ),
    ).toBe(false);
  });
});
