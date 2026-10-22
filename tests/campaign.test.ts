import { describe, expect, it } from "vitest";
import { campaignFor } from "../src/lib/campaign";

// What the house asks for, and — more importantly — when it asks for nothing.

describe("campaignFor", () => {
  it("asks for scripts while the round is collecting", () => {
    const c = campaignFor("collecting", 0);
    expect(c?.key).toBe("submit");
    expect(c?.path).toBe("/submit");
  });

  it("asks for votes once the ballot has pitches on it", () => {
    const c = campaignFor("voting", 9);
    expect(c?.key).toBe("vote");
    expect(c?.path).toBe("/vote");
  });

  it("says nothing when a round is voting with an empty ballot", () => {
    // The failure this exists to prevent: a "NINE FILMS, ONE GETS MADE"
    // banner on every screen, linking to a page with nothing on it. A
    // mis-set status shouldn't become a promise the site can't keep.
    expect(campaignFor("voting", 0)).toBeNull();
  });

  it("stops asking once the film is chosen or the round is shut", () => {
    expect(campaignFor("greenlit", 9)).toBeNull();
    expect(campaignFor("closed", 9)).toBeNull();
  });

  it("says nothing when there is no round at all", () => {
    expect(campaignFor(null, 0)).toBeNull();
    expect(campaignFor(undefined, 5)).toBeNull();
  });

  it("matches today's live state — collecting, zero pitches — with the open call", () => {
    // The round on thedeepcut.xyz right now. Pinned so that a change to the
    // rule which would silence the open call fails here rather than quietly
    // emptying the one banner that's meant to be running.
    expect(campaignFor("collecting", 0)?.key).toBe("submit");
  });
});
