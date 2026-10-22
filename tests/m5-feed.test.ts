import { describe, expect, it } from "vitest";
import { actorName, mergeFeed, type FeedItem } from "@/lib/feed";

const actor = { id: "u1", handle: "griffin", display_name: "Griffin" };
const movie = { id: 1, title: "Living in Oblivion", year: 1995, poster_path: null, genres: [], tmdb: null, imdb: null, rt: null };

function watch(id: string, at: string): FeedItem {
  return {
    kind: "watch",
    id,
    at,
    actor,
    movie,
    reaction: "loved",
    why: null,
    note: null,
  };
}

describe("M5 — derived feed (watches + playlists)", () => {
  it("merges streams newest-first", () => {
    const items: FeedItem[] = [
      watch("a", "2026-07-01T00:00:00Z"),
      watch("w1", "2026-07-03T00:00:00Z"),
      {
        kind: "playlist",
        id: "p1",
        at: "2026-07-02T00:00:00Z",
        actor,
        name: "tape",
        filmCount: 5,
        shareSlug: "abc123def456",
      },
    ];
    expect(mergeFeed(items).map((i) => i.id)).toEqual(["w1", "p1", "a"]);
  });

  it("caps the feed at the limit", () => {
    const items = Array.from({ length: 80 }, (_, i) =>
      watch(String(i), `2026-07-01T00:00:${String(i % 60).padStart(2, "0")}Z`),
    );
    expect(mergeFeed(items, 50)).toHaveLength(50);
  });

  it("prefers handle over display name", () => {
    expect(actorName(actor)).toBe("@griffin");
    expect(actorName({ id: "x", handle: null, display_name: "Ann" })).toBe("Ann");
    expect(actorName({ id: "x", handle: null, display_name: null })).toBe("someone");
  });
});
