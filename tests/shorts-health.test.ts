import { describe, it, expect } from "vitest";
import { readPlayability } from "@/lib/playability";

// Both of these arrive as LOGIN_REQUIRED. Only the reason separates a film
// that is broken for everyone from an afternoon when YouTube doesn't like our
// IP — and getting that backwards means archiving good films.

describe("age-gated is broken", () => {
  it("catches the wall Kung Fury actually shows", () => {
    const r = readPlayability("LOGIN_REQUIRED", "Sign in to confirm your age");
    expect(r.verdict).toBe("age_restricted");
  });

  it("catches it however it's worded", () => {
    expect(readPlayability("LOGIN_REQUIRED", "This video is age-restricted").verdict).toBe(
      "age_restricted",
    );
  });
});

describe("rate-limited is not a broken film", () => {
  it("does not condemn a film because YouTube throttled us", () => {
    // The Cat Came Back returns exactly this from a datacentre IP, and it
    // plays perfectly well for a person.
    const r = readPlayability("LOGIN_REQUIRED", "Sign in to confirm you’re not a bot");
    expect(r.verdict).toBe("unknown");
  });

  it("treats unusual-traffic the same way", () => {
    expect(readPlayability("LOGIN_REQUIRED", "We have detected unusual traffic").verdict).toBe(
      "unknown",
    );
  });
});

describe("everything else", () => {
  it("passes a playable film", () => {
    expect(readPlayability("OK", "").verdict).toBe("ok");
  });

  it("flags one the owner made unplayable", () => {
    expect(readPlayability("UNPLAYABLE", "Video unavailable").verdict).toBe("blocked");
  });

  it("flags one that's gone", () => {
    expect(readPlayability("ERROR", "Video unavailable").verdict).toBe("gone");
  });

  it("says unknown rather than guessing at a status it doesn't recognise", () => {
    expect(readPlayability("SOMETHING_NEW", "").verdict).toBe("unknown");
  });
});
