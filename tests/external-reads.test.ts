import { describe, expect, it } from "vitest";
import { ExternalReadInput } from "../src/lib/schemas";

// The scheme guard on member-published links.
//
// These are rendered on a public film page and opened with Linking.openURL in
// the app. z.string().url() on its own accepts any scheme, so the field would
// take javascript:, data: and file: URLs — at which point it isn't a link
// field, it's a payload field, published to everyone who opens the film.

const ok = (url: string) =>
  ExternalReadInput.safeParse({ movieId: 550, title: "A piece about it", url }).success;

describe("external read links", () => {
  it("takes ordinary article links", () => {
    expect(ok("https://example.com/piece-about-fight-club")).toBe(true);
    expect(ok("http://example.com/older-site")).toBe(true);
    expect(ok("https://example.com/a?utm=1&ref=2#section")).toBe(true);
  });

  it("refuses script and local-file schemes", () => {
    // Each of these parsed as a valid URL before the refine() was added.
    for (const bad of [
      "javascript:alert(document.cookie)",
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "file:///etc/passwd",
      "vbscript:msgbox(1)",
    ]) {
      expect(ok(bad), bad).toBe(false);
    }
  });

  it("refuses things that aren't URLs at all", () => {
    expect(ok("not a url")).toBe(false);
    expect(ok("")).toBe(false);
  });

  it("still enforces the length cap", () => {
    expect(ok(`https://example.com/${"x".repeat(500)}`)).toBe(false);
  });

  it("requires a title", () => {
    expect(
      ExternalReadInput.safeParse({ movieId: 550, title: "", url: "https://example.com" }).success,
    ).toBe(false);
  });
});
