import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";
import { createCheckoutSession, validateLifetimePrice, verifyWebhookSignature } from "@/lib/stripe";

const SECRET = "whsec_test_secret";
const NOW = 1_800_000_000;

function sign(payload: string, t = NOW, secret = SECRET): string {
  const v1 = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

describe("verifyWebhookSignature", () => {
  const payload = JSON.stringify({ type: "checkout.session.completed" });

  it("accepts a valid signature", () => {
    expect(verifyWebhookSignature(payload, sign(payload), SECRET, 300, NOW)).toBe(true);
  });

  describe("checkout", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it("creates a separate one-time donation without changing a subscription", async () => {
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: "https://checkout.stripe.test" })));
      vi.stubGlobal("fetch", fetchMock);
      await createCheckoutSession({
        userId: "user-1", email: "member@example.test", appUrl: "https://example.test",
        plan: "donation", amountCents: 2_500,
      });
      const options = fetchMock.mock.calls[0][1] as RequestInit;
      const params = new URLSearchParams(options.body as string);
      expect(params.get("mode")).toBe("payment");
      expect(params.get("line_items[0][price_data][unit_amount]")).toBe("2500");
      expect(params.get("metadata[plan]")).toBe("donation");
      expect(params.get("subscription_data[metadata][user_id]")).toBeNull();
    });

    it("accepts only the advertised lifetime Stripe price", async () => {
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
      vi.stubEnv("STRIPE_PRICE_ID_LIFETIME", "price_test");
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ active: true, currency: "usd", unit_amount: 15_000, type: "one_time" })))
        .mockResolvedValueOnce(new Response(JSON.stringify({ active: true, currency: "usd", unit_amount: 20_000, type: "one_time" })));
      vi.stubGlobal("fetch", fetchMock);
      await expect(validateLifetimePrice()).resolves.toBeUndefined();
      await expect(validateLifetimePrice()).rejects.toThrow("one-time USD $150");
    });

    it("creates a reserved lifetime checkout idempotently without discount codes", async () => {
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
      vi.stubEnv("STRIPE_PRICE_ID_LIFETIME", "price_test");
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: "https://checkout.stripe.test" })));
      vi.stubGlobal("fetch", fetchMock);
      await createCheckoutSession({
        userId: "user-1", email: "member@example.test", appUrl: "https://example.test",
        plan: "lifetime", lifetimeReservation: { id: "reservation-1", expiresAt: 1_900_000_000 },
      });
      const options = fetchMock.mock.calls[0][1] as RequestInit;
      const params = new URLSearchParams(options.body as string);
      expect(params.get("metadata[lifetime_reservation_id]")).toBe("reservation-1");
      expect(params.get("expires_at")).toBe("1900000000");
      expect(params.has("allow_promotion_codes")).toBe(false);
      expect((options.headers as Record<string, string>)["Idempotency-Key"]).toBe("lifetime-reservation-1");
    });
  });

  it("rejects a tampered payload", () => {
    expect(verifyWebhookSignature(payload + "x", sign(payload), SECRET, 300, NOW)).toBe(false);
  });

  it("rejects the wrong secret", () => {
    expect(
      verifyWebhookSignature(payload, sign(payload, NOW, "whsec_other"), SECRET, 300, NOW),
    ).toBe(false);
  });

  it("rejects stale timestamps (replay)", () => {
    expect(verifyWebhookSignature(payload, sign(payload, NOW - 600), SECRET, 300, NOW)).toBe(
      false,
    );
  });

  it("rejects missing/malformed headers", () => {
    expect(verifyWebhookSignature(payload, null, SECRET, 300, NOW)).toBe(false);
    expect(verifyWebhookSignature(payload, "t=123", SECRET, 300, NOW)).toBe(false);
    expect(verifyWebhookSignature(payload, "v1=deadbeef", SECRET, 300, NOW)).toBe(false);
  });
});
