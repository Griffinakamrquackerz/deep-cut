import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => ({ from: mocks.from }) }));
import { getPremium } from "@/lib/premium";

function row(data: object | null, error: object | null = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

describe("premium earned by donations", () => {
  beforeEach(() => mocks.from.mockReset());

  it("uses the later donation entitlement without changing subscription details", async () => {
    const user = row({ premium_until: "2026-01-01T00:00:00Z", stripe_customer_id: "cus_test" });
    const donation = row({ premium_until: "2026-03-01T00:00:00Z" });
    mocks.from.mockImplementation((table: string) => table === "users" ? user : donation);
    expect(await getPremium("member")).toEqual({
      premiumUntil: "2026-03-01T00:00:00Z", stripeCustomerId: "cus_test",
    });
  });

  it("keeps lifetime access instead of shortening it to the donated month", async () => {
    const user = row({ premium_until: "2099-12-31T00:00:00Z", stripe_customer_id: "cus_test" });
    const donation = row({ premium_until: "2026-03-01T00:00:00Z" });
    mocks.from.mockImplementation((table: string) => table === "users" ? user : donation);
    expect((await getPremium("member")).premiumUntil).toBe("2099-12-31T00:00:00Z");
  });

  it("surfaces an entitlement read failure", async () => {
    const user = row({ premium_until: "2099-12-31T00:00:00Z", stripe_customer_id: null });
    const donation = row(null, { message: "database unavailable" });
    mocks.from.mockImplementation((table: string) => table === "users" ? user : donation);
    await expect(getPremium("member")).rejects.toThrow("donation premium unreadable");
  });
});
