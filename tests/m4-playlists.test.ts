import { describe, expect, it } from "vitest";
import { makeShareSlug, playlistProgress } from "@/lib/slug";

describe("M4 — share slugs", () => {
  it("generates 12-char lowercase base36 slugs", () => {
    const slug = makeShareSlug();
    expect(slug).toMatch(/^[a-z0-9]{12}$/);
  });

  it("is effectively collision-free at MVP scale", () => {
    const seen = new Set(Array.from({ length: 2000 }, () => makeShareSlug()));
    expect(seen.size).toBe(2000);
  });
});

describe("M4 — playlist progress", () => {
  it("computes crossed-off progress", () => {
    const items = [
      { crossed_off: true },
      { crossed_off: false },
      { crossed_off: true },
      { crossed_off: false },
    ];
    expect(playlistProgress(items)).toEqual({ done: 2, total: 4, pct: 50 });
  });

  it("handles empty playlists without dividing by zero", () => {
    expect(playlistProgress([])).toEqual({ done: 0, total: 0, pct: 0 });
  });
});
