import { describe, expect, it } from "vitest";
import { actorName, mergeFeed, type FeedItem } from "@/lib/feed";
import { TakeInput } from "@/lib/schemas";

const actor = { id: "u1", handle: "griffin", display_name: "Griffin" };
const movie = { id: 1, title: "Living in Oblivion", year: 1995, poster_path: null, genres: [] };

function take(id: string, at: string): FeedItem {
  return { kind: "take", id, at, actor, movie, body: "b", likes: 0, likedByMe: false };
}

describe("M5 — derived feed", () => {
  it("merges streams newest-first", () => {
    const items: FeedItem[] = [
      take("a", "2026-07-01T00:00:00Z"),
      {
        kind: "watch",
        id: "w1",
        at: "2026-07-03T00:00:00Z",
        actor,
        movie,
        reaction: "loved",
        why: null,
        note: null,
      },
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
      take(String(i), `2026-07-01T00:00:${String(i % 60).padStart(2, "0")}Z`),
    );
    expect(mergeFeed(items, 50)).toHaveLength(50);
  });

  it("prefers handle over display name", () => {
    expect(actorName(actor)).toBe("@griffin");
    expect(actorName({ id: "x", handle: null, display_name: "Ann" })).toBe("Ann");
    expect(actorName({ id: "x", handle: null, display_name: null })).toBe("someone");
  });
});

describe("M5 — takes are short", () => {
  it("rejects takes over 300 chars", () => {
    expect(TakeInput.safeParse({ movieId: 1, body: "x".repeat(300) }).success).toBe(true);
    expect(TakeInput.safeParse({ movieId: 1, body: "x".repeat(301) }).success).toBe(false);
    expect(TakeInput.safeParse({ movieId: 1, body: "" }).success).toBe(false);
  });
});
