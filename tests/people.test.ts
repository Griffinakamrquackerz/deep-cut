import { describe, it, expect } from "vitest";
import { peopleFrom } from "@/lib/people";

// The app carries its own copy (deep-cut-native/src/lib/people.ts) and can't be
// imported here — it pulls in the React Native api client. Unlike the mention
// regex, a divergence in this one is visible the moment you open the picker
// rather than silently tagging the wrong person, so it's covered by reading
// rather than by a parity test.

const griffin = { id: "1", handle: "griffin", display_name: "Griffin", avatar_url: null };
const dana = { id: "2", handle: "dana", display_name: "Dana", avatar_url: null };
const sam = { id: "3", handle: "sam", display_name: "Sam", avatar_url: null };

describe("peopleFrom", () => {
  it("takes a search response as-is", () => {
    expect(peopleFrom({ results: [griffin] })).toEqual([griffin]);
  });

  it("merges both halves of the address book", () => {
    expect(peopleFrom({ followers: [griffin], following: [dana] })).toEqual([griffin, dana]);
  });

  it("puts followers first — an untyped pick is usually to someone who came to you", () => {
    expect(peopleFrom({ following: [dana], followers: [griffin] })[0]).toEqual(griffin);
  });

  it("lists someone who both follows you and is followed by you once", () => {
    expect(peopleFrom({ followers: [griffin, sam], following: [griffin, dana] })).toEqual([
      griffin,
      sam,
      dana,
    ]);
  });

  it("prefers an empty results array over the address book", () => {
    // A search that found nobody must read as "nobody by that name", not fall
    // back to listing everyone you know.
    expect(peopleFrom({ results: [], followers: [griffin] })).toEqual([]);
  });

  it("survives a failed or empty response", () => {
    expect(peopleFrom(null)).toEqual([]);
    expect(peopleFrom({})).toEqual([]);
  });
});
