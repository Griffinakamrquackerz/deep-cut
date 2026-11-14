import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  record: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  setPremium: vi.fn(),
  track: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getSubscription: vi.fn(),
  verifyWebhookSignature: () => true,
}));
vi.mock("@/lib/premium", () => ({ setPremium: mocks.setPremium }));
vi.mock("@/lib/fund", () => ({
  recordContribution: mocks.record,
  premiumUntilFor: vi.fn(),
  premiumMonthsFor: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("@/lib/waitlist", () => ({ approveEmail: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ track: mocks.track }));

import { POST } from "@/app/api/stripe/webhook/route";

describe("donation webhook", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    mocks.record.mockReset().mockResolvedValue(true);
    mocks.rpc.mockReset();
    mocks.setPremium.mockReset();
  });

  describe("lifetime webhook", () => {
    const slotQuery = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
    };
    beforeEach(() => {
      vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
      mocks.from.mockReset().mockReturnValue(slotQuery);
      slotQuery.maybeSingle.mockReset().mockResolvedValue({ data: { user_id: "member-1" }, error: null });
      mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null });
      mocks.record.mockReset().mockResolvedValue(true);
      mocks.track.mockReset().mockResolvedValue(undefined);
    });
    afterEach(() => vi.unstubAllEnvs());

    const deliver = (paymentStatus: string, amount = 15_000) =>
      POST(new Request("https://example.test/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify({ type: "checkout.session.completed", data: { object: {
          id: "cs_lifetime", amount_total: amount, currency: "usd", payment_status: paymentStatus,
          metadata: { plan: "lifetime", user_id: "member-1", lifetime_reservation_id: "slot-1" },
        } } }),
      }));

    it("grants lifetime and records support only after a paid reserved checkout", async () => {
      expect((await deliver("paid")).status).toBe(200);
      expect(mocks.from).toHaveBeenCalledWith("lifetime_slots");
      expect(mocks.rpc).toHaveBeenCalledWith("grant_lifetime_premium", { p_user_id: "member-1" });
      expect(mocks.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        userId: "member-1", grossCents: 15_000, kind: "lifetime",
      }));
    });

    it("does not grant lifetime for an unpaid or incorrect amount", async () => {
      expect((await deliver("unpaid")).status).toBe(200);
      expect((await deliver("paid", 100)).status).toBe(500);
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.record).not.toHaveBeenCalled();
    });

    it("retries rather than granting access without a reservation", async () => {
      slotQuery.maybeSingle.mockResolvedValue({ data: null, error: null });
      expect((await deliver("paid")).status).toBe(500);
      expect(mocks.rpc).not.toHaveBeenCalled();
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  const deliver = (paymentStatus: string, type = "checkout.session.completed") =>
    POST(new Request("https://example.test/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({ type, data: { object: {
        id: "cs_test", amount_total: 2500, currency: "usd", payment_status: paymentStatus,
        metadata: { plan: "donation", user_id: "member-1" },
      } } }),
    }));

  it("records a paid donation once by session and leaves premium alone", async () => {
    expect((await deliver("paid")).status).toBe(200);
    expect(mocks.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      userId: "member-1", grossCents: 2500, kind: "donation", stripeRef: "cs_cs_test",
    }));
    expect(mocks.setPremium).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("waits for payment and handles asynchronous success", async () => {
    expect((await deliver("unpaid")).status).toBe(200);
    expect(mocks.record).not.toHaveBeenCalled();
    expect((await deliver("paid", "checkout.session.async_payment_succeeded")).status).toBe(200);
    expect(mocks.record).toHaveBeenCalledTimes(1);
  });

  it("asks Stripe to retry if the donation cannot be recorded", async () => {
    mocks.record.mockResolvedValue(false);
    expect((await deliver("paid")).status).toBe(500);
  });
});
