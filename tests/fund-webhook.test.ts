import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  record: vi.fn(),
  donation: vi.fn(),
  points: vi.fn(),
  approve: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  setPremium: vi.fn(),
  track: vi.fn(),
  subscription: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getSubscription: mocks.subscription,
  verifyWebhookSignature: () => true,
}));
vi.mock("@/lib/fund", () => ({
  recordContribution: mocks.record,
  recordDonation: mocks.donation,
  recordPointsPurchase: mocks.points,
  premiumMonthsFor: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("@/lib/waitlist", () => ({ approveEmail: mocks.approve }));
vi.mock("@/lib/analytics", () => ({ track: mocks.track }));

import { POST } from "@/app/api/stripe/webhook/route";

describe("donation webhook", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    mocks.record.mockReset().mockResolvedValue(true);
    mocks.donation.mockReset().mockResolvedValue(undefined);
    mocks.points.mockReset().mockResolvedValue(undefined);
    mocks.approve.mockReset().mockResolvedValue({ ok: true, userId: "member-1" });
    mocks.track.mockReset().mockResolvedValue(undefined);
    mocks.subscription.mockReset().mockResolvedValue({ metadata: { user_id: "member-1", plan: "annual" } });
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

    const deliver = (paymentStatus: string, amount = 15_000, subtotal = 15_000) =>
      POST(new Request("https://example.test/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify({ type: "checkout.session.completed", data: { object: {
          id: "cs_lifetime", amount_subtotal: subtotal, amount_total: amount, currency: "usd", payment_status: paymentStatus,
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

    it("grants lifetime and credits the full amount when tax is added", async () => {
      expect((await deliver("paid", 15_938)).status).toBe(200);
      expect(mocks.rpc).toHaveBeenCalledWith("grant_lifetime_premium", { p_user_id: "member-1" });
      expect(mocks.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ grossCents: 15_938 }));
    });

    it("does not grant lifetime for an unpaid or incorrect amount", async () => {
      expect((await deliver("unpaid")).status).toBe(200);
      expect((await deliver("paid", 100)).status).toBe(500);
      expect((await deliver("paid", 15_000, 100)).status).toBe(500);
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

  const deliver = (paymentStatus: string, type = "checkout.session.completed", plan = "donation") =>
    POST(new Request("https://example.test/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({ type, data: { object: {
        id: "cs_test", amount_total: 2500, currency: "usd", payment_status: paymentStatus,
        metadata: { plan, user_id: "member-1" },
      } } }),
    }));

  it("records a paid donation through the atomic entitlement handler", async () => {
    expect((await deliver("paid")).status).toBe(200);
    expect(mocks.donation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      userId: "member-1", grossCents: 2500, stripeRef: "cs_cs_test",
    }));
    expect(mocks.setPremium).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("waits for payment and handles asynchronous success", async () => {
    expect((await deliver("unpaid")).status).toBe(200);
    expect(mocks.donation).not.toHaveBeenCalled();
    expect((await deliver("paid", "checkout.session.async_payment_succeeded")).status).toBe(200);
    expect(mocks.donation).toHaveBeenCalledTimes(1);
  });

  it("asks Stripe to retry if the donation cannot be recorded", async () => {
    mocks.donation.mockRejectedValue(new Error("ledger unavailable"));
    expect((await deliver("paid")).status).toBe(500);
  });

  it("records paid points purchases separately from legacy donations", async () => {
    expect((await deliver("unpaid", "checkout.session.completed", "points")).status).toBe(200);
    expect(mocks.points).not.toHaveBeenCalled();
    expect((await deliver("paid", "checkout.session.async_payment_succeeded", "points")).status).toBe(200);
    expect(mocks.points).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      userId: "member-1", grossCents: 2500, stripeRef: "cs_cs_test",
    }));
    expect(mocks.donation).not.toHaveBeenCalled();
  });

  it("keeps legacy skip-line sessions on their original terms", async () => {
    const deliverSkip = (points: boolean) => POST(new Request("https://example.test/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({ type: "checkout.session.completed", data: { object: {
        id: "cs_skip", amount_total: 500, currency: "usd", payment_status: "paid",
        metadata: { skip_line: "1", email: "member@example.test", ...(points ? { points_purchase: "1" } : {}) },
      } } }),
    }));
    expect((await deliverSkip(false)).status).toBe(200);
    expect(mocks.donation).toHaveBeenCalledTimes(1);
    expect((await deliverSkip(true)).status).toBe(200);
    expect(mocks.points).toHaveBeenCalledTimes(1);
  });

  it("credits each paid annual invoice and retries if the ledger write fails", async () => {
    const invoice = (amount: number) => POST(new Request("https://example.test/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({ type: "invoice.payment_succeeded", data: { object: {
        id: "in_annual", amount_paid: amount, currency: "usd",
        parent: { subscription_details: { subscription: "sub_annual" } },
      } } }),
    }));
    expect((await invoice(0)).status).toBe(200);
    expect(mocks.record).not.toHaveBeenCalled();
    expect((await invoice(3999)).status).toBe(200);
    expect(mocks.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      userId: "member-1", grossCents: 3999, kind: "subscription", stripeRef: "in_in_annual",
    }));
    mocks.record.mockResolvedValueOnce(false);
    expect((await invoice(3999)).status).toBe(500);
  });
});
