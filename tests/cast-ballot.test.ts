import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const standing = vi.hoisted(() => vi.fn());
vi.mock("@/lib/fund", () => ({
  currentCycle: () => "film-01",
  myStanding: standing,
}));
import { castBallot } from "@/lib/voting";

function database() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const db = {
    from(table: string) {
      if (table === "film_rounds") {
        const q = { select: () => q, eq: () => q, maybeSingle: async () => ({
          data: { id: "film-01", title: "Round", status: "voting" }, error: null,
        }) };
        return q;
      }
      if (table === "film_pitches") {
        const q = { select: () => q, eq: () => q, order: async () => ({
          data: [{ id: "pitch", title: "Film" }], error: null,
        }) };
        return q;
      }
      const q = {
        delete: () => q,
        eq: () => q,
        then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
        insert,
      };
      return q;
    },
  };
  return { db: db as unknown as SupabaseClient, insert };
}

describe("casting an uncapped ballot", () => {
  it("allows all earned votes on one pitch and rejects spending more", async () => {
    const { db, insert } = database();
    standing.mockResolvedValue({ points: 150_000 });
    expect(await castBallot(db, "member", { pitch: 150_000 })).toMatchObject({ ok: true, spent: 150_000 });
    expect(insert).toHaveBeenCalledWith([expect.objectContaining({ pitch_id: "pitch", votes: 150_000 })]);
    expect(await castBallot(db, "member", { pitch: 150_001 })).toMatchObject({ ok: false, reason: "over_budget" });
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
