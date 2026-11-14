import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock("@/lib/tmdb", () => ({
  searchMovies: vi.fn(),
}));

import { FEATURED_CANON, HOUSE_CANON } from "@/lib/canon";
import { getFeaturedFilms, matchFeaturedFilm } from "@/lib/featured-films";
import { searchMovies } from "@/lib/tmdb";

const result = {
  id: 123,
  title: "House",
  original_title: "Hausu",
  year: 1977,
  poster_path: "/house.jpg",
  overview: "A strange house.",
  popularity: 1,
  vote_count: 500,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("TMDB_API_KEY", "test-key");
});
afterEach(() => vi.unstubAllEnvs());

describe("featured house picks", () => {
  it("uses a diverse, unique selection from the house canon", () => {
    expect(FEATURED_CANON).toHaveLength(8);
    expect(new Set(FEATURED_CANON.map((film) => film.t)).size).toBe(8);
    for (const film of FEATURED_CANON) {
      expect(Object.values(HOUSE_CANON).flat()).toContainEqual({ t: film.t, y: film.y });
      expect(film.note).toBeTruthy();
    }
  });

  it("matches the exact title and year rather than a remake or unrelated search result", () => {
    const pick = { t: "House", y: 1977 };
    expect(matchFeaturedFilm(pick, [
      { ...result, id: 1, title: "House of Games" },
      { ...result, id: 2, year: 1986 },
      result,
    ])?.id).toBe(123);
    expect(matchFeaturedFilm(pick, [{ ...result, year: 1986 }])).toBeUndefined();
  });

  it("exposes the matching poster, description and public movie id", async () => {
    vi.mocked(searchMovies).mockResolvedValue([result]);
    const films = await getFeaturedFilms();
    expect(films[0]).toEqual({
      title: "House", year: 1977, id: 123, posterPath: "/house.jpg", description: FEATURED_CANON[0].note,
    });
    expect(films[1].id).toBeNull();
  });

  it("retains the curated film with an explicit unavailable state if its lookup fails", async () => {
    vi.mocked(searchMovies).mockRejectedValue(new Error("offline"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const films = await getFeaturedFilms();
    expect(films).toHaveLength(8);
    expect(films[0]).toEqual({
      title: "House", year: 1977, id: null, posterPath: null, description: FEATURED_CANON[0].note,
    });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("does not call TMDB when its key is missing", async () => {
    vi.stubEnv("TMDB_API_KEY", "");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getFeaturedFilms()).toHaveLength(8);
    expect(searchMovies).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
