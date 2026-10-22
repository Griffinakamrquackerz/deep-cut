import { describe, expect, it, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("OMDb ratings", () => {
  it("returns nulls when no key is configured (TMDB-only fallback)", async () => {
    vi.stubEnv("OMDB_API_KEY", "");
    const { getOmdbRatings, omdbConfigured } = await import("@/lib/omdb");
    expect(omdbConfigured()).toBe(false);
    expect(await getOmdbRatings("tt0110413")).toEqual({ imdb: null, rt: null, votes: null });
  });

  it("parses IMDb rating and Rotten Tomatoes % from an OMDb payload", async () => {
    vi.stubEnv("OMDB_API_KEY", "test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          Response: "True",
          imdbRating: "7.8",
          imdbVotes: "1,234,567",
          Ratings: [
            { Source: "Internet Movie Database", Value: "7.8/10" },
            { Source: "Rotten Tomatoes", Value: "91%" },
          ],
        }),
      })),
    );
    const { getOmdbRatings } = await import("@/lib/omdb");
    expect(await getOmdbRatings("tt0110413")).toEqual({ imdb: 7.8, rt: 91, votes: 1_234_567 });
  });

  it("handles missing ratings gracefully (N/A)", async () => {
    vi.stubEnv("OMDB_API_KEY", "test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ Response: "True", imdbRating: "N/A", imdbVotes: "N/A", Ratings: [] }),
      })),
    );
    const { getOmdbRatings } = await import("@/lib/omdb");
    expect(await getOmdbRatings("tt0000000")).toEqual({ imdb: null, rt: null, votes: null });
  });
});
