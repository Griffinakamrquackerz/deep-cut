import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  rpc: vi.fn(),
  checkout: vi.fn(),
  validatePrice: vi.fn(),
  validateAnnual: vi.fn(),
  annualReady: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ currentUser: mocks.user }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/premium", () => ({ premiumConfigured: () => true }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/stripe", () => ({
  createCheckoutSession: mocks.checkout,
  annualConfigured: mocks.annualReady,
  lifetimeConfigured: () => true,
  validateLifetimePrice: mocks.validatePrice,
  validateAnnualPrice: mocks.validateAnnual,
  SUPPORT_MIN_CENTS: 100,
  SUPPORT_MAX_CENTS: 99_999_999,
}));

import { POST } from "@/app/api/stripe/checkout/route";

const request = (body: object) => new Request("https://example.test/api/stripe/checkout", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("checkout route", () => {
  beforeEach(() => {
    mocks.user.mockReset().mockResolvedValue({ id: "member-1", email: "member@example.test" });
    mocks.rpc.mockReset();
    mocks.checkout.mockReset().mockResolvedValue({ url: "https://checkout.stripe.test" });
    mocks.validatePrice.mockReset().mockResolvedValue(undefined);
    mocks.validateAnnual.mockReset().mockResolvedValue(undefined);
    mocks.annualReady.mockReset().mockReturnValue(true);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("does not create a lifetime checkout once the limit is reached", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ result: "sold_out" }], error: null });
    const response = await POST(request({ plan: "lifetime" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "lifetime_sold_out" });
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it("fails closed if the lifetime reservation migration is unavailable", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "missing function" } });
    expect((await POST(request({ plan: "lifetime" }))).status).toBe(503);
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it("uses the reserved place to create a lifetime checkout", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ result: "pending", reservation_id: "slot-1", reserved_at: new Date().toISOString() }],
      error: null,
    });
    expect((await POST(request({ plan: "lifetime" }))).status).toBe(200);
    expect(mocks.checkout).toHaveBeenCalledWith(expect.objectContaining({
      plan: "lifetime", lifetimeReservation: expect.objectContaining({ id: "slot-1" }),
    }));
  });

  it("validates the amount for points purchases", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    for (const amountCents of [99, 100.5, 100_000_000]) {
      expect((await POST(request({ plan: "points", amountCents }))).status).toBe(400);
    }
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect((await POST(request({ plan: "points", amountCents: 501 }))).status).toBe(200);
    expect(mocks.checkout).toHaveBeenCalledWith(expect.objectContaining({ plan: "points", amountCents: 501 }));
  });

  it("only starts annual checkout when its price is configured and validated", async () => {
    mocks.annualReady.mockReturnValueOnce(false);
    expect((await POST(request({ plan: "annual" }))).status).toBe(503);
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect((await POST(request({ plan: "annual" }))).status).toBe(200);
    expect(mocks.validateAnnual).toHaveBeenCalledTimes(1);
    expect(mocks.checkout).toHaveBeenCalledWith(expect.objectContaining({ plan: "annual" }));
    mocks.validateAnnual.mockRejectedValueOnce(new Error("invalid price"));
    expect((await POST(request({ plan: "annual" }))).status).toBe(502);
    expect(mocks.checkout).toHaveBeenCalledTimes(1);
  });
});
