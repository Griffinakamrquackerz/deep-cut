import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reach, alreadySent, markSent } from "../src/lib/broadcast";

// The guards around a send that cannot be recalled.
//
// broadcast() itself talks to two push services and isn't worth faking end to
// end. What IS worth pinning is everything that decides WHETHER it runs and
// how many people it would hit — because those are the failures that reach a
// thousand lock screens rather than a log file.

vi.mock("../src/lib/push", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/push")>("../src/lib/push");
  return { ...actual, pushConfigured: () => true };
});

const expoTokens = vi.hoisted(() => ({ value: [] as Array<{ token: string; userId: string }> }));
vi.mock("../src/lib/expo-push", () => ({
  activeExpoTokens: async () => expoTokens.value,
  sendExpoPush: async () => ({ sent: 0, dead: [] as string[] }),
}));

/** A Supabase stand-in that answers only what these functions actually ask. */
function fakeDb(opts: {
  webSubs?: Array<{ user_id: string }>;
  sentRows?: Array<{ created_at: string }>;
  onInsert?: (row: Record<string, unknown>) => { error: { message: string } | null };
}): SupabaseClient {
  return {
    from(table: string) {
      if (table === "push_subscriptions") {
        return { select: async () => ({ data: opts.webSubs ?? [], error: null }) };
      }
      // events — the announcement marker
      const chain = {
        select: () => chain,
        eq: () => chain,
        contains: () => chain,
        order: () => chain,
        limit: async () => ({ data: opts.sentRows ?? [], error: null }),
        insert: async (row: Record<string, unknown>) =>
          opts.onInsert ? opts.onInsert(row) : { error: null },
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  expoTokens.value = [];
});

describe("reach", () => {
  it("counts people, not devices", () => {
    // The number on the button is what an admin decides on. One person with a
    // laptop, a phone browser and the app is one person being interrupted,
    // not three — counting devices would overstate the blast radius every
    // time and make a small list look like a big one.
    expoTokens.value = [{ token: "t1", userId: "alice" }];
    return expect(
      reach(fakeDb({ webSubs: [{ user_id: "alice" }, { user_id: "alice" }, { user_id: "bob" }] })),
    ).resolves.toEqual({ people: 2, webDevices: 3, nativeDevices: 1 });
  });

  it("counts somebody who only has the app", async () => {
    expoTokens.value = [{ token: "t1", userId: "carol" }];
    const r = await reach(fakeDb({ webSubs: [] }));
    expect(r).toEqual({ people: 1, webDevices: 0, nativeDevices: 1 });
  });

  it("is zero when nobody has opted in", async () => {
    // Zero must be reachable and honest: the panel refuses to arm on it.
    await expect(reach(fakeDb({}))).resolves.toEqual({
      people: 0,
      webDevices: 0,
      nativeDevices: 0,
    });
  });
});

describe("alreadySent", () => {
  it("reports when this announcement went out", async () => {
    const at = "2026-09-02T18:00:00.000Z";
    await expect(alreadySent(fakeDb({ sentRows: [{ created_at: at }] }), "submit:film-01")).resolves.toBe(at);
  });

  it("returns null when it hasn't", async () => {
    // null is what unlocks the send. A false positive here silently blocks a
    // legitimate announcement; a false negative sends a duplicate to
    // everybody. Both directions matter, which is why it's pinned.
    await expect(alreadySent(fakeDb({ sentRows: [] }), "submit:film-01")).resolves.toBeNull();
  });
});

describe("markSent", () => {
  it("records the campaign, the round and the counts", async () => {
    let captured: Record<string, unknown> | null = null;
    await markSent(
      fakeDb({
        onInsert: (row) => {
          captured = row;
          return { error: null };
        },
      }),
      "submit:film-01",
      "admin-id",
      { web: { sent: 12, pruned: 1 }, native: { sent: 8, dead: 0 }, people: 17 },
    );
    expect(captured).toMatchObject({
      name: "announcement_sent",
      user_id: "admin-id",
      props: { key: "submit:film-01", web: 12, native: 8, people: 17 },
    });
  });

  it("shouts when the marker fails to save", async () => {
    // This is the nasty one. The push has ALREADY gone out by the time this
    // runs, so a silent failure here means the guard forgets and the next
    // press notifies everybody a second time.
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await markSent(
      fakeDb({ onInsert: () => ({ error: { message: "events table is read-only" } }) }),
      "submit:film-01",
      "admin-id",
      { web: { sent: 1, pruned: 0 }, native: { sent: 0, dead: 0 }, people: 1 },
    );
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("sent but not recorded"),
    );
    err.mockRestore();
  });
});
