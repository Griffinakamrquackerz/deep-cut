import { describe, expect, it } from "vitest";
import { parseVideoUrl } from "@/lib/video-url";

describe("parseVideoUrl (whatever a filmmaker actually pastes)", () => {
  it("reads a plain Vimeo page URL", () => {
    expect(parseVideoUrl("https://vimeo.com/887931553")).toEqual({
      source: "vimeo",
      videoId: "887931553",
    });
  });

  it("reads a Vimeo player embed URL", () => {
    expect(parseVideoUrl("https://player.vimeo.com/video/887931553")).toEqual({
      source: "vimeo",
      videoId: "887931553",
    });
  });

  it("ignores a Vimeo share hash after the id", () => {
    expect(parseVideoUrl("https://vimeo.com/887931553?share=copy")).toEqual({
      source: "vimeo",
      videoId: "887931553",
    });
  });

  it("reads a standard YouTube watch URL", () => {
    expect(parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      source: "youtube",
      videoId: "dQw4w9WgXcQ",
    });
  });

  it("reads a youtu.be short link", () => {
    expect(parseVideoUrl("https://youtu.be/dQw4w9WgXcQ")).toEqual({
      source: "youtube",
      videoId: "dQw4w9WgXcQ",
    });
  });

  it("reads a YouTube Shorts URL", () => {
    expect(parseVideoUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toEqual({
      source: "youtube",
      videoId: "dQw4w9WgXcQ",
    });
  });

  it("rejects a URL from neither platform", () => {
    expect(parseVideoUrl("https://example.com/dQw4w9WgXcQ")).toBeNull();
  });

  it("rejects text that isn't a URL at all", () => {
    expect(parseVideoUrl("just the title of a film")).toBeNull();
  });

  it("rejects a Vimeo URL with no video id in it", () => {
    expect(parseVideoUrl("https://vimeo.com/watch")).toBeNull();
  });
});
