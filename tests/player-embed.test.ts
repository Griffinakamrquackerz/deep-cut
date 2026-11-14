import { describe, expect, it } from "vitest";
import { playerEmbedUrl } from "@/lib/player-embed";

const vimeo = { source: "vimeo" as const, videoId: "887931553" };
const youtube = { source: "youtube" as const, videoId: "dQw4w9WgXcQ" };

const q = (url: string) => new URL(url).searchParams;

describe("playerEmbedUrl (the parameters that keep a film in the room)", () => {
  it("asks Vimeo to play inline, so iOS stops taking the film fullscreen", () => {
    const url = playerEmbedUrl(vimeo);
    expect(url.startsWith("https://player.vimeo.com/video/887931553?")).toBe(true);
    expect(q(url).get("playsinline")).toBe("1");
  });

  it("asks YouTube the same", () => {
    const url = playerEmbedUrl(youtube);
    expect(url.startsWith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?")).toBe(true);
    expect(q(url).get("playsinline")).toBe("1");
  });

  it("keeps YouTube's command channel open for the MUTE key", () => {
    expect(q(playerEmbedUrl(youtube)).get("enablejsapi")).toBe("1");
  });

  it("autoplays both, which is the whole basis of a channel", () => {
    expect(q(playerEmbedUrl(vimeo)).get("autoplay")).toBe("1");
    expect(q(playerEmbedUrl(youtube)).get("autoplay")).toBe("1");
  });

  it("keeps the platform's chrome off both players", () => {
    const v = q(playerEmbedUrl(vimeo));
    expect(v.get("title")).toBe("0");
    expect(v.get("byline")).toBe("0");
    expect(v.get("portrait")).toBe("0");
    expect(v.get("dnt")).toBe("1");
    expect(q(playerEmbedUrl(youtube)).get("rel")).toBe("0");
  });

  it("starts unmuted by default, since the URL must not change mid-film", () => {
    expect(q(playerEmbedUrl(vimeo)).get("muted")).toBe("0");
    expect(q(playerEmbedUrl(youtube)).get("mute")).toBe("0");
  });

  it("starts muted when a caller asks it to", () => {
    expect(q(playerEmbedUrl(vimeo, { muted: true })).get("muted")).toBe("1");
    expect(q(playerEmbedUrl(youtube, { muted: true })).get("mute")).toBe("1");
  });

  it("is deterministic — the same film always yields the same URL", () => {
    expect(playerEmbedUrl(vimeo)).toBe(playerEmbedUrl(vimeo));
  });
});
