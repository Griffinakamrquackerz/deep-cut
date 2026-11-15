import { afterEach, describe, expect, it, vi } from "vitest";

const checkout = vi.hoisted(() => vi.fn());
vi.mock("@/lib/stripe", () => ({
  createSkipLineSession: checkout,
  SKIP_LINE_MIN_CENTS: 100,
  SUPPORT_MAX_CENTS: 99_999_999,
}));
import { POST } from "@/app/api/skip-line/route";

const request = (amountCents: number) => new Request("https://example.test/api/skip-line", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "member@example.test", amountCents }),
});

describe("skip-line checkout", () => {
  afterEach(() => { vi.unstubAllEnvs(); checkout.mockReset(); });

  it("accepts $1 and the per-transaction maximum, and rejects invalid amounts", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    checkout.mockResolvedValue({ url: "https://checkout.stripe.test" });
    for (const amount of [99, 100.5, 100_000_000]) {
      expect((await POST(request(amount))).status).toBe(400);
    }
    expect(checkout).not.toHaveBeenCalled();
    for (const amount of [100, 99_999_999]) {
      expect((await POST(request(amount))).status).toBe(200);
      expect(checkout).toHaveBeenLastCalledWith(expect.objectContaining({ amountCents: amount }));
    }
  });
});
