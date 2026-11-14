import { describe, expect, it } from "vitest";
import { HOUSE_CANON, pickCanonHit } from "@/lib/canon";

describe("house canon shelves", () => {
  it("every pick carries a title and a year", () => {
    for (const [key, picks] of Object.entries(HOUSE_CANON)) {
      expect(picks.length, `${key} shelf is empty`).toBeGreaterThan(0);
      for (const p of picks) {
        expect(p.t.trim().length, `${key} has a blank title`).toBeGreaterThan(0);
        expect(Number.isInteger(p.y), `${key} / ${p.t} has a non-integer year`).toBe(true);
      }
    }
  });

  it("resolves an exact title inside the year band over a more popular near-match", () => {
    // TMDB search for "House" leads with National Lampoon's Animal House (1978),
    // which sits inside the ±1-year tolerance of the Scare shelf's
    // { House, 1977 } (Hausu). That collision was putting a frat comedy on the
    // horror channel's repertory shelf.
    const hits = [
      { id: 8469, title: "National Lampoon's Animal House", year: 1978, poster_path: "/a.jpg" },
      { id: 11906, title: "House", year: 1977, poster_path: "/h.jpg" },
    ];
    expect(pickCanonHit(hits, { t: "House", y: 1977 })?.id).toBe(11906);
  });

  it("falls back to the year band when no title matches exactly", () => {
    // TMDB files Lake Mungo under 2009; the shelf says 2008.
    const hits = [{ id: 27374, title: "Lake Mungo", year: 2009, poster_path: "/l.jpg" }];
    expect(pickCanonHit(hits, { t: "Lake Mungo", y: 2008 })?.id).toBe(27374);
  });

  it("ignores hits outside the year band and hits with no poster", () => {
    const hits = [
      { id: 1, title: "Suspiria", year: 2018, poster_path: "/remake.jpg" },
      { id: 2, title: "Suspiria", year: 1977, poster_path: null },
      { id: 3, title: "Suspiria", year: 1977, poster_path: "/original.jpg" },
    ];
    expect(pickCanonHit(hits, { t: "Suspiria", y: 1977 })?.id).toBe(3);
  });

  it("returns null when nothing is in band", () => {
    expect(pickCanonHit([], { t: "Kill List", y: 2011 })).toBeNull();
    const offBand = [{ id: 1, title: "Kill List", year: 2020, poster_path: "/k.jpg" }];
    expect(pickCanonHit(offBand, { t: "Kill List", y: 2011 })).toBeNull();
  });

  it("keeps the Scare shelf's Hausu pick — the entry that collided", () => {
    expect(HOUSE_CANON.scare).toContainEqual({ t: "House", y: 1977 });
  });
});
