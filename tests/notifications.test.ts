import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notify, notifyMany } from "@/lib/notifications";

vi.mock("@/lib/push-user", () => ({
  pushToUser: vi.fn(async () => ({ web: 1, native: 0 })),
}));
import { pushToUser } from "@/lib/push-user";

// The bug these exist for: supabase-js RESOLVES with { error } instead of
// rejecting, so `.then(ok, fail)` never runs its failure arm on a database
// error. notify swallowed that, returned nothing, and the send route reported
// "Sent" for a row that was never written.

function fakeDb(result: { error: { message: string } | null }): SupabaseClient {
  return {
    from: () => ({ insert: () => Promise.resolve(result) }),
  } as unknown as SupabaseClient;
}

const OK = { error: null };
const FAILED = { error: { message: "insert or update violates foreign key constraint" } };

describe("notify", () => {
  it("reports true when the row lands", async () => {
    expect(await notify(fakeDb(OK), { userId: "u1", actorId: "u2", kind: "film_sent" })).toBe(true);
  });

  it("reports false on a database error rather than swallowing it", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await notify(fakeDb(FAILED), { userId: "u1", actorId: "u2", kind: "film_sent" })).toBe(
      false,
    );
    expect(spy).toHaveBeenCalled(); // and it's visible in the logs
    spy.mockRestore();
  });

  it("reports false when the client throws outright", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = {
      from: () => ({
        insert: () => Promise.reject(new Error("network")),
      }),
    } as unknown as SupabaseClient;
    expect(await notify(db, { userId: "u1", actorId: "u2", kind: "mention" })).toBe(false);
    spy.mockRestore();
  });

  it("does not notify you about your own doing, and does not claim it did", async () => {
    expect(await notify(fakeDb(OK), { userId: "u1", actorId: "u1", kind: "mention" })).toBe(false);
  });

  it("still writes when there is no actor at all", async () => {
    expect(await notify(fakeDb(OK), { userId: "u1", actorId: null, kind: "film_sent" })).toBe(true);
  });
});

describe("notifyMany", () => {
  it("counts the rows it wrote", async () => {
    expect(await notifyMany(fakeDb(OK), ["a", "b"], { actorId: "z", kind: "mention" })).toBe(2);
  });

  it("counts one person tagged twice once", async () => {
    expect(await notifyMany(fakeDb(OK), ["a", "a", "b"], { actorId: "z", kind: "mention" })).toBe(2);
  });

  it("drops the actor from their own fan-out", async () => {
    expect(await notifyMany(fakeDb(OK), ["a", "z"], { actorId: "z", kind: "mention" })).toBe(1);
  });

  it("returns 0 on a database error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await notifyMany(fakeDb(FAILED), ["a"], { actorId: "z", kind: "mention" })).toBe(0);
    spy.mockRestore();
  });

  it("writes nothing when everyone tagged is the author", async () => {
    expect(await notifyMany(fakeDb(OK), ["z", "z"], { actorId: "z", kind: "mention" })).toBe(0);
  });
});

describe("push rides on the row, not on the attempt", () => {
  const push = { title: "t", body: "b", path: "/m/1", tag: "x" };

  it("rings when the row landed", async () => {
    vi.mocked(pushToUser).mockClear();
    await notify(fakeDb(OK), { userId: "u1", actorId: "u2", kind: "film_sent", push });
    expect(pushToUser).toHaveBeenCalledOnce();
  });

  // The one that matters: announcing something that isn't in the inbox sends
  // somebody to an empty screen.
  it("stays silent when the insert failed", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(pushToUser).mockClear();
    await notify(fakeDb(FAILED), { userId: "u1", actorId: "u2", kind: "film_sent", push });
    expect(pushToUser).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("stays silent when there is no push payload", async () => {
    vi.mocked(pushToUser).mockClear();
    await notify(fakeDb(OK), { userId: "u1", actorId: "u2", kind: "film_sent" });
    expect(pushToUser).not.toHaveBeenCalled();
  });

  it("rings once per recipient, never the author", async () => {
    vi.mocked(pushToUser).mockClear();
    await notifyMany(fakeDb(OK), ["a", "b", "z"], { actorId: "z", kind: "mention", push });
    expect(pushToUser).toHaveBeenCalledTimes(2);
  });
});
