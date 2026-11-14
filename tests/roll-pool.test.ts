import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cacheMovie: vi.fn(),
  discoverSettleCandidates: vi.fn(),
  resolveKeywordIds: vi.fn(async () => [99]),
  searchMovies: vi.fn(async (_query: string): Promise<Array<{
    id: number;
    title: string;
    year: number;
    poster_path: string;
    overview: string;
    popularity: number;
    vote_count: number;
  }>> => []),
}));

vi.mock("@/lib/tmdb", () => ({
  cacheMovie: mocks.cacheMovie,
  discoverSettleCandidates: mocks.discoverSettleCandidates,
  resolveKeywordIds: mocks.resolveKeywordIds,
  searchMovies: mocks.searchMovies,
  TMDB_GENRE_IDS: {
    Comedy: 35,
    Mystery: 9648,
    Drama: 18,
  },
}));

vi.mock("@/lib/supabase/server", () => ({ currentUser: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: vi.fn(() => ({})) }));
vi.mock("@/lib/region", () => ({
  regionForRequest: vi.fn(async () => "US"),
  serviceAvailableIn: vi.fn(() => true),
}));
vi.mock("@/lib/services", () => ({ tmdbProviderIds: vi.fn(() => []) }));

import { HOUSE_CANON } from "@/lib/canon";

async function postPool(vibe: string) {
  const { POST } = await import("@/app/api/roll/pool/route");
  return POST(new Request("http://localhost/api/roll/pool", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ vibe }),
  }));
}

async function postSettlePool(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/settle/pool/route");
  return POST(new Request("http://localhost/api/settle/pool", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.searchMovies.mockResolvedValue([]);
  mocks.resolveKeywordIds.mockResolvedValue([99]);
  mocks.discoverSettleCandidates.mockResolvedValue([]);
  mocks.cacheMovie.mockImplementation(async (id: number) => ({
    id,
    title: `Film ${id}`,
    year: 2020,
    runtime: 100,
    poster_path: "/poster.jpg",
    overview: "A film.",
    genres: ["Drama", "Mystery"],
    popularity: 5,
    vote_count: 600,
    vote_average: 7.8,
    imdb_id: null,
    imdb_votes: 9_000,
    providers: {},
    ratings: { imdb: 7.5, tmdb: 7.8, rt: null },
  }));
});

describe("Just Roll It pool", () => {
  it("keeps the less-seen floor and removes comedy and IMDb-famous films from Melt my brain", async () => {
    mocks.discoverSettleCandidates.mockImplementation(async (opts: { keywordIds?: number[] }) =>
      opts.keywordIds?.length
        ? [
            {
              id: 1, title: "Gabriel Iglesias comedy", year: 2020,
              poster_path: "/poster.jpg", overview: "", genre_ids: [35],
              vote_count: 600, vote_average: 7.8, popularity: 5, original_language: "en",
            },
            {
              id: 2, title: "Enola Holmes 2", year: 2022,
              poster_path: "/poster.jpg", overview: "", genre_ids: [9648],
              vote_count: 1_000, vote_average: 8, popularity: 5, original_language: "en",
            },
            {
              id: 3, title: "Obscure mind-bender", year: 2020,
              poster_path: "/poster.jpg", overview: "", genre_ids: [18, 9648],
              vote_count: 600, vote_average: 7.8, popularity: 5, original_language: "en",
            },
            {
              id: 4, title: "Unclassified film", year: 2020,
              poster_path: "/poster.jpg", overview: "", genre_ids: [],
              vote_count: 600, vote_average: 7.8, popularity: 5, original_language: "en",
            },
          ]
        : [],
    );
    mocks.cacheMovie.mockImplementation(async (id: number) => ({
      id,
      title: id === 1 ? "Gabriel Iglesias comedy" : id === 2 ? "Enola Holmes 2" : "Obscure mind-bender",
      year: id === 2 ? 2022 : 2020,
      runtime: 100,
      poster_path: "/poster.jpg",
      overview: "",
      genres: id === 1 ? ["Comedy"] : id === 3 ? ["Drama", "Mystery"] : id === 4 ? [] : ["Mystery"],
      popularity: 5,
      vote_count: id === 2 ? 1_000 : 600,
      vote_average: 7.8,
      imdb_id: "tt0000000",
      imdb_votes: id === 2 ? 80_000 : 9_000,
      providers: {},
      ratings: { imdb: 7.5, tmdb: 7.8, rt: null },
    }));

    const response = await postPool("mind");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.candidates.map((candidate: { id: number }) => candidate.id)).toEqual([3]);
    expect(mocks.discoverSettleCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ obscurityMin: 3, minRating: 6.5 }),
    );
  });

  describe("Settle It pool", () => {
    it("enforces the less-seen floor, verified rating, and IMDb fame cap", async () => {
      mocks.discoverSettleCandidates.mockResolvedValue([
        {
          id: 1, title: "Known hit", year: 2018, poster_path: "/poster.jpg", overview: "",
          genre_ids: [27], vote_count: 10_000, vote_average: 8, popularity: 5,
        },
        {
          id: 2, title: "Low-rated obscurity", year: 2018, poster_path: "/poster.jpg", overview: "",
          genre_ids: [27], vote_count: 1_000, vote_average: 5.5, popularity: 5,
        },
        {
          id: 3, title: "IMDb-famous film", year: 2018, poster_path: "/poster.jpg", overview: "",
          genre_ids: [27], vote_count: 1_000, vote_average: 8, popularity: 5,
        },
        {
          id: 4, title: "Qualified hidden gem", year: 2018, poster_path: "/poster.jpg", overview: "",
          genre_ids: [27], vote_count: 5_000, vote_average: 7.8, popularity: 5,
        },
        {
          id: 5, title: "Wrong mood", year: 2018, poster_path: "/poster.jpg", overview: "",
          genre_ids: [35], vote_count: 5_000, vote_average: 7.8, popularity: 5,
        },
      ]);
      mocks.cacheMovie.mockImplementation(async (id: number) => ({
        id,
        title: `Film ${id}`,
        year: 2018,
        runtime: 100,
        poster_path: "/poster.jpg",
        overview: "",
        genres: ["Horror"],
        popularity: 5,
        vote_count: id === 1 ? 10_000 : 1_000,
        vote_average: id === 2 ? 5.5 : 7.8,
        imdb_id: "tt0000000",
        imdb_votes: id === 3 ? 80_000 : 9_000,
        providers: {},
        ratings: { imdb: id === 2 ? 5.5 : 7.8, tmdb: 7.8, rt: null },
      }));

      const response = await postSettlePool({
        genreIds: [27],
        obscurityMin: 1,
        obscurityMax: 3,
        eitherShort: false,
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.candidates.map((candidate: { id: number }) => candidate.id)).toEqual([4]);
      expect(body.candidates[0].imdb_votes).toBe(9_000);
      expect(mocks.discoverSettleCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ obscurityMin: 3, obscurityMax: 5, minRating: 6.5 }),
      );
    });
  });

  it("does not exempt well-known house-canon titles from the hard gates", async () => {
    mocks.searchMovies.mockImplementation(async (title: string) => {
      const index = HOUSE_CANON.mind.findIndex((pick) => pick.t === title);
      if (index < 0) return [];
      const pick = HOUSE_CANON.mind[index];
      return [{
        id: 500 + index,
        title: pick.t,
        year: pick.y,
        poster_path: "/poster.jpg",
        overview: "",
        popularity: 5,
        vote_count: 600,
      }];
    });
    mocks.cacheMovie.mockImplementation(async (id: number) => ({
      id,
      title: `Known canon ${id}`,
      year: 1980,
      runtime: 100,
      poster_path: "/poster.jpg",
      overview: "",
      genres: ["Mystery"],
      popularity: 5,
      vote_count: 600,
      vote_average: 8,
      imdb_id: "tt0000000",
      imdb_votes: 80_000,
      providers: {},
      ratings: { imdb: 8, tmdb: 8, rt: null },
    }));

    const response = await postPool("mind");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.cacheMovie).toHaveBeenCalled();
    expect(body.candidates).toEqual([]);
  });
});
