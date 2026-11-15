import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  premium: vi.fn(),
  admin: vi.fn(),
  deal: vi.fn(),
  counts: new Map<string, number>(),
  windows: new Map<string, { start: number; used: number }>(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  currentUser: async () => ({ id: "member", email: "member@example.test" }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    rpc: mocks.rpc,
    from: () => {
      const filters: Record<string, string> = {};
      const query = {
        select: () => query,
        eq: (key: string, value: string) => { filters[key] = value; return query; },
        maybeSingle: async () => ({ data: { count: mocks.counts.get(filters.user_id) ?? 0 } }),
        upsert: async (row: { user_id: string; count: number }) => {
          mocks.counts.set(row.user_id, row.count);
          return { error: null };
        },
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/premium", () => ({ isPremium: mocks.premium }));
vi.mock("@/lib/admin", () => ({ isAdminEmail: mocks.admin }));
vi.mock("@/lib/engine", () => ({ dealRecs: mocks.deal }));

const request = () => new Request("https://example.test/api/recs", { method: "POST", body: "{}" });

describe("recommendation limits", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
    vi.stubEnv("DAILY_REC_BATCHES", "1");
    vi.stubEnv("DAILY_REC_BATCHES_FREE", "1");
    mocks.admin.mockReturnValue(false);
    mocks.deal.mockResolvedValue([{ id: 1 }]);
    mocks.rpc.mockImplementation(async (name: string, args: { p_user_id: string; p_limit?: number; p_window_start?: string }) => {
      const old = mocks.windows.get(args.p_user_id);
      if (name === "refund_free_deal") {
        if (old && new Date(old.start).toISOString() === args.p_window_start && old.used > 0) old.used--;
        return { error: null };
      }
      const now = Date.now();
      const window = !old || old.used === 0 || now >= old.start + 48 * 3_600_000
        ? { start: now, used: 0 } : old;
      const allowed = window.used < (args.p_limit ?? 0);
      if (allowed) window.used++;
      mocks.windows.set(args.p_user_id, window);
      return { data: [{
        allowed, window_start: new Date(window.start).toISOString(),
        resets_at: new Date(window.start + 48 * 3_600_000).toISOString(),
      }], error: null };
    });
  });
  afterEach(() => {
    mocks.counts.clear();
    mocks.windows.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("allows eight free deals in a window and resets after 48 hours", async () => {
    vi.resetModules();
    const { POST } = await import("@/app/api/recs/route");
    mocks.premium.mockResolvedValue(false);
    for (let i = 0; i < 8; i++) expect((await POST(request())).status).toBe(200);
    vi.advanceTimersByTime(47 * 3_600_000);
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      limit: "8 deals/48 hours", premium: false, resetsAt: "2026-01-03T10:00:00.000Z",
    });
    vi.advanceTimersByTime(3_600_000);
    expect((await POST(request())).status).toBe(200);
  });

  it("keeps the premium allowance at 30 a day", async () => {
    vi.resetModules();
    const { POST } = await import("@/app/api/recs/route");
    mocks.premium.mockResolvedValue(true);
    for (let i = 0; i < 30; i++) expect((await POST(request())).status).toBe(200);
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ limit: "30 deals/day", premium: true });
  });

  it("refunds empty and failed free deals without touching admin quotas", async () => {
    const { POST } = await import("@/app/api/recs/route");
    mocks.premium.mockResolvedValue(false);
    mocks.deal.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("deal failed"));
    expect((await POST(request())).status).toBe(200);
    expect((await POST(request())).status).toBe(500);
    expect(mocks.windows.get("member")?.used).toBe(0);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "refund_free_deal")).toHaveLength(2);
    expect(mocks.rpc).toHaveBeenCalledWith("refund_free_deal", {
      p_user_id: "member", p_window_start: "2026-01-01T10:00:00.000Z",
    });
    mocks.admin.mockReturnValue(true);
    mocks.deal.mockResolvedValueOnce([]);
    expect((await POST(request())).status).toBe(200);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "refund_free_deal")).toHaveLength(2);
  });

  it("fails closed when the free quota cannot be reserved", async () => {
    const { POST } = await import("@/app/api/recs/route");
    mocks.premium.mockResolvedValue(false);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "missing function" } });
    expect((await POST(request())).status).toBe(503);
    expect(mocks.deal).not.toHaveBeenCalled();
  });

  it("reports a refund error instead of saying the attempt was free", async () => {
    const { POST } = await import("@/app/api/recs/route");
    mocks.premium.mockResolvedValue(false);
    mocks.deal.mockResolvedValue([]);
    mocks.rpc.mockImplementationOnce(async () => ({
      data: [{ allowed: true, window_start: "2026-01-01T10:00:00.000Z", resets_at: "2026-01-03T10:00:00.000Z" }],
      error: null,
    })).mockResolvedValueOnce({ error: { message: "refund failed" } });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "deal_refund_failed" });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
});
