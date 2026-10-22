import { describe, expect, it } from "vitest";
import { parseHandles, splitMentions, tokenAtCaret } from "@/lib/mentions";

describe("parseHandles (@ in a comment)", () => {
  it("finds a plain handle", () => {
    expect(parseHandles("watch it with @griff")).toEqual(["griff"]);
  });

  it("finds several, in order, without repeats", () => {
    expect(parseHandles("@ana @bo and @ana again")).toEqual(["ana", "bo"]);
  });

  it("lowercases, so @Griff and @griff are one person", () => {
    expect(parseHandles("@Griff and @GRIFF")).toEqual(["griff"]);
  });

  it("leaves a trailing full stop to the sentence", () => {
    // "ask @griff." is a sentence ending, not a handle called "griff."
    expect(parseHandles("ask @griff.")).toEqual(["griff"]);
  });

  it("ignores an email address", () => {
    // The @ in an address has a word character before it, so it starts no
    // handle. Without this the tail of every address posted in a comment
    // would tag a user, if one ever held that handle.
    expect(parseHandles("mail me at griffin@hostfluencer.com")).toEqual([]);
  });

  it("still finds a handle after punctuation", () => {
    expect(parseHandles("(@griff) and, @ana!")).toEqual(["griff", "ana"]);
  });

  it("finds a handle at the very start", () => {
    expect(parseHandles("@griff watch this")).toEqual(["griff"]);
  });

  it("ignores a bare @ and a one-character handle", () => {
    expect(parseHandles("@ and @a")).toEqual([]);
  });

  it("finds nothing in text with no handles", () => {
    expect(parseHandles("no tags here at all")).toEqual([]);
  });
});

describe("splitMentions (rendering)", () => {
  it("links only handles that exist", () => {
    const spans = splitMentions("hey @griff and @nobody", new Set(["griff"]));
    expect(spans).toEqual([
      { kind: "text", value: "hey " },
      { kind: "mention", value: "griff" },
      { kind: "text", value: " and @nobody" },
    ]);
  });

  it("keeps the text either side intact", () => {
    const spans = splitMentions("@ana said watch it", new Set(["ana"]));
    expect(spans).toEqual([
      { kind: "mention", value: "ana" },
      { kind: "text", value: " said watch it" },
    ]);
  });

  it("passes a body with no mentions straight through", () => {
    expect(splitMentions("just a comment", new Set(["griff"]))).toEqual([
      { kind: "text", value: "just a comment" },
    ]);
  });

  it("does not swallow the full stop after a handle", () => {
    const spans = splitMentions("ask @griff.", new Set(["griff"]));
    expect(spans).toEqual([
      { kind: "text", value: "ask " },
      { kind: "mention", value: "griff" },
      { kind: "text", value: "." },
    ]);
  });
});

describe("tokenAtCaret (which @ the picker should follow)", () => {
  it("finds the token the caret is inside", () => {
    const v = "hey @gri";
    expect(tokenAtCaret(v, v.length)).toEqual({ at: 4, query: "gri" });
  });

  it("opens on a bare @", () => {
    const v = "hey @";
    expect(tokenAtCaret(v, v.length)).toEqual({ at: 4, query: "" });
  });

  it("closes once a space is typed", () => {
    const v = "hey @griff and";
    expect(tokenAtCaret(v, v.length)).toBeNull();
  });

  it("ignores an earlier finished mention", () => {
    // Caret is after "cool", not in the @ana token.
    const v = "@ana that was cool";
    expect(tokenAtCaret(v, v.length)).toBeNull();
  });

  it("follows the caret back into an earlier token", () => {
    const v = "@ana that was cool";
    expect(tokenAtCaret(v, 4)).toEqual({ at: 0, query: "ana" });
  });

  it("does not open inside an email address", () => {
    const v = "griffin@host";
    expect(tokenAtCaret(v, v.length)).toBeNull();
  });

  it("is null when there is no @ at all", () => {
    expect(tokenAtCaret("no tags", 7)).toBeNull();
  });
});
