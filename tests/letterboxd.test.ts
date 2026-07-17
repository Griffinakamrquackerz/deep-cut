import { describe, expect, it } from "vitest";
import { parseCsv, parseLetterboxdCsv } from "@/lib/letterboxd";

const RATINGS_CSV = `Date,Name,Year,Letterboxd URI,Rating
2024-01-15,Parasite,2019,https://boxd.it/abc,5
2024-02-01,"Nick and Norah's Infinite Playlist",2008,https://boxd.it/def,3.5
2024-03-10,"Love, Actually",2003,https://boxd.it/ghi,2
2024-04-04,The Room,2003,https://boxd.it/jkl,0.5
`;

const WATCHED_CSV = `Date,Name,Year,Letterboxd URI
2023-11-11,Heat,1995,https://boxd.it/xyz
2023-12-25,Die Hard,1988,https://boxd.it/uvw
`;

describe("parseCsv", () => {
  it("handles quoted fields with commas and escaped quotes", () => {
    const rows = parseCsv('a,"b,c","d""e"\n1,2,3');
    expect(rows).toEqual([
      ["a", "b,c", 'd"e'],
      ["1", "2", "3"],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("parseLetterboxdCsv", () => {
  it("parses ratings.csv with titles, years, ratings, dates", () => {
    const rows = parseLetterboxdCsv(RATINGS_CSV);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({
      title: "Parasite",
      year: 2019,
      rating: 5,
      date: "2024-01-15",
    });
    expect(rows[1].title).toBe("Nick and Norah's Infinite Playlist");
    expect(rows[1].rating).toBe(3.5);
    expect(rows[2].title).toBe("Love, Actually");
    expect(rows[3].rating).toBe(0.5);
  });

  it("parses watched.csv (no rating column) with null ratings", () => {
    const rows = parseLetterboxdCsv(WATCHED_CSV);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ title: "Heat", year: 1995, rating: null, date: "2023-11-11" });
  });

  it("returns empty for non-Letterboxd CSVs and junk", () => {
    expect(parseLetterboxdCsv("foo,bar\n1,2")).toEqual([]);
    expect(parseLetterboxdCsv("")).toEqual([]);
  });

  it("skips rows with empty titles and tolerates bad years", () => {
    const rows = parseLetterboxdCsv("Date,Name,Year,Rating\n2024-01-01,,1999,4\n2024-01-02,Tenet,abc,4\n");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ title: "Tenet", year: null, rating: 4, date: "2024-01-02" });
  });
});
