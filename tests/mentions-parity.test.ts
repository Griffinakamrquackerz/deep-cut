import { describe, it, expect } from "vitest";
import * as web from "@/lib/mentions";
// The app ships its own copy — it can't import from the web package. The whole
// point of this file is that the copy doesn't drift: a comment must tag the
// same people whether it was typed on the site or in the app.
import * as app from "../deep-cut-native/src/lib/mentions";

const BODIES = [
  "@griffin have you seen this",
  "no mentions here at all",
  "tell @griffin and @dana about it",
  "mail me at griffin@hostfluencer.com",
  "email griffin@hostfluencer.com and tell @dana",
  "ask @griffin.",
  "ask @griffin, then @dana!",
  "(@griffin) parenthetical",
  "@griffin@dana squashed together",
  "@a too short",
  "@_underscore_ and @dot.name",
  "line one\n@griffin on line two",
  "trailing @",
  "@GRIFFIN shouting",
  "punctuation:@griffin after a colon",
];

const KNOWN = new Set(["griffin", "dana", "_underscore_", "dot.name", "hostfluencer.com"]);

describe("mentions: web and app agree", () => {
  it("splits every body the same way", () => {
    for (const body of BODIES) {
      expect(app.splitMentions(body, KNOWN), body).toEqual(web.splitMentions(body, KNOWN));
    }
  });

  it("finds the same token at every caret position", () => {
    for (const body of BODIES) {
      for (let caret = 0; caret <= body.length; caret++) {
        expect(app.tokenAtCaret(body, caret), `${body} @${caret}`).toEqual(
          web.tokenAtCaret(body, caret),
        );
      }
    }
  });
});

describe("mentions: the email guard holds in both", () => {
  // The regression this exists for: the tail of an email address must not
  // parse as a mention, or "griffin@hostfluencer.com" tags hostfluencer.com.
  const body = "mail me at griffin@hostfluencer.com";

  it("leaves an email address as plain text", () => {
    for (const impl of [web, app]) {
      expect(impl.splitMentions(body, KNOWN)).toEqual([{ kind: "text", value: body }]);
    }
  });

  it("never opens the picker inside an email address", () => {
    const at = body.indexOf("@");
    for (let caret = at; caret <= body.length; caret++) {
      for (const impl of [web, app]) {
        expect(impl.tokenAtCaret(body, caret)).toBeNull();
      }
    }
  });
});

describe("mentions: no lookbehind", () => {
  // Hermes, which the app actually runs on, throws on a lookbehind at parse
  // time — the module would fail to load rather than misbehave, so assert the
  // source doesn't contain one.
  it("both sources avoid (?<= and (?<!", async () => {
    const fs = await import("node:fs/promises");
    for (const path of [
      new URL("../src/lib/mentions.ts", import.meta.url),
      new URL("../deep-cut-native/src/lib/mentions.ts", import.meta.url),
    ]) {
      const src = await fs.readFile(path, "utf8");
      expect(src, path.pathname).not.toMatch(/\(\?<[=!]/);
    }
  });
});
