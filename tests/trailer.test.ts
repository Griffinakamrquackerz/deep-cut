import { describe, expect, it } from "vitest";
import { pickBestVideo, type TmdbVideo } from "@/lib/tmdb";

const vid = (over: Partial<TmdbVideo>): TmdbVideo => ({
  key: "k",
  site: "YouTube",
  type: "Trailer",
  official: true,
  name: "Trailer",
  ...over,
});

describe("pickBestVideo", () => {
  it("prefers official trailers over unofficial ones", () => {
    const best = pickBestVideo([
      vid({ key: "fan", official: false }),
      vid({ key: "official", official: true }),
    ]);
    expect(best?.key).toBe("official");
  });

  it("prefers any trailer over a teaser", () => {
    const best = pickBestVideo([
      vid({ key: "teaser", type: "Teaser", official: true }),
      vid({ key: "trailer", type: "Trailer", official: false }),
    ]);
    expect(best?.key).toBe("trailer");
  });

  it("falls back to a teaser when no trailer exists", () => {
    const best = pickBestVideo([vid({ key: "teaser", type: "Teaser" })]);
    expect(best?.key).toBe("teaser");
  });

  it("ignores non-YouTube videos and clips/featurettes", () => {
    expect(
      pickBestVideo([
        vid({ key: "vimeo", site: "Vimeo" }),
        vid({ key: "clip", type: "Clip" }),
        vid({ key: "bts", type: "Behind the Scenes" }),
      ]),
    ).toBeNull();
  });

  it("breaks ties by newest published date", () => {
    const best = pickBestVideo([
      vid({ key: "old", published_at: "2010-01-01T00:00:00Z" }),
      vid({ key: "new", published_at: "2024-01-01T00:00:00Z" }),
    ]);
    expect(best?.key).toBe("new");
  });

  it("returns null for an empty list", () => {
    expect(pickBestVideo([])).toBeNull();
  });
});
