import { beforeEach, describe, expect, it, vi } from "vitest";

const cast = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  currentUser: async () => ({ id: "member" }),
}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/voting", () => ({ castBallot: cast }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
import { POST } from "@/app/api/vote/route";

const pitch = "a18b61e4-15ef-4bb3-9c55-3b34056b7bb9";
const request = (votes: number) => new Request("https://example.test/api/vote", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ allocation: { [pitch]: votes } }),
});

describe("vote allocation", () => {
  beforeEach(() => cast.mockReset());

  it("accepts allocations above the former per-pitch and 32-bit limits", async () => {
    cast.mockResolvedValue({ ok: true, spent: 2_147_483_648, budget: 2_147_483_648 });
    expect((await POST(request(2_147_483_648))).status).toBe(200);
    expect(cast).toHaveBeenCalledWith(expect.anything(), "member", { [pitch]: 2_147_483_648 });
  });

  it("still rejects allocations above the member's budget", async () => {
    cast.mockResolvedValue({ ok: false, reason: "over_budget", budget: 1 });
    expect((await POST(request(100_001))).status).toBe(400);
  });
});
