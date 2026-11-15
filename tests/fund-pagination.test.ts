import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fundProgress, myStanding } from "@/lib/fund";
import { tallies } from "@/lib/voting";

type Row = Record<string, string | number>;

function database(rows: Row[], pageCap: number, failAt?: number): SupabaseClient {
  const db = {
    from() {
      const filters: Array<[string, string]> = [];
      const query = {
        select() { return query; },
        eq(column: string, value: string) { filters.push([column, value]); return query; },
        order() { return query; },
        async range(start: number, end: number) {
          if (start === failAt) return { data: null, count: null, error: { message: "read failed" } };
          const matching = rows.filter((row) => filters.every(([column, value]) => row[column] === value));
          return {
            data: matching.slice(start, Math.min(end + 1, start + pageCap)),
            count: matching.length,
            error: null,
          };
        },
      };
      return query;
    },
  };
  return db as unknown as SupabaseClient;
}

describe("ledger and tally pagination", () => {
  it("counts every contribution even when the server caps each page", async () => {
    const rows = Array.from({ length: 1_201 }, (_, i) => ({
      id: String(i), cycle: "film-01", currency: "usd", user_id: "member",
      gross_cents: 101, fund_cents: 60,
    }));
    const db = database(rows, 127);
    expect(await myStanding(db, "member")).toMatchObject({ givenCents: 121_301, points: 1_213 });
    expect(await fundProgress(db)).toMatchObject({ raisedCents: 72_060, backers: 1 });
  });

  it("surfaces ledger read errors rather than returning a partial total", async () => {
    const rows = Array.from({ length: 4 }, (_, i) => ({
      id: String(i), cycle: "film-01", currency: "usd", user_id: "member",
      gross_cents: 100, fund_cents: 60,
    }));
    const db = database(rows, 2, 2);
    await expect(myStanding(db, "member")).rejects.toThrow("fund ledger unreadable");
    await expect(fundProgress(db)).rejects.toThrow("fund ledger unreadable");
  });

  it("counts all votes and backers across pages and reports errors", async () => {
    const rows = Array.from({ length: 1_201 }, (_, i) => ({
      round_id: "film-01", pitch_id: "pitch", user_id: `member-${i}`, votes: 3,
    }));
    await expect(tallies(database(rows, 127), "film-01")).resolves.toEqual([
      { pitchId: "pitch", votes: 3_603, backers: 1_201 },
    ]);
    await expect(tallies(database(rows, 127, 127), "film-01")).rejects.toThrow("votes unreadable");
  });
});
