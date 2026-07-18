import { describe, expect, it } from "vitest";
import { createHmac } from "crypto";
import { verifyWebhookSignature } from "@/lib/stripe";

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
