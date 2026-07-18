// Minimal Stripe client over raw REST — no SDK dependency. Everything the
// Balcony Seats subscription needs: checkout with a 3-month trial, the
// billing portal, subscription reads, and webhook signature verification.

import { createHmac, timingSafeEqual } from "crypto";

const API = "https://api.stripe.com/v1";

function key(): string {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) throw new Error("STRIPE_SECRET_KEY not set");
  return k;
}

/** Stripe wants application/x-www-form-urlencoded with bracket nesting. */
function form(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

async function stripePost<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form(params),
  });
  const data = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(data.error?.message ?? `Stripe ${res.status} on ${path}`);
  return data;
}

async function stripeGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${key()}` },
  });
  const data = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(data.error?.message ?? `Stripe ${res.status} on ${path}`);
  return data;
}

const TRIAL_DAYS = 90; // the 3-month free trial

export async function createCheckoutSession(opts: {
  userId: string;
  email: string;
  appUrl: string;
}): Promise<{ url: string }> {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) throw new Error("STRIPE_PRICE_ID not set");
  return stripePost<{ url: string }>("/checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    customer_email: opts.email,
    client_reference_id: opts.userId,
    "subscription_data[trial_period_days]": String(TRIAL_DAYS),
    "subscription_data[metadata][user_id]": opts.userId,
    allow_promotion_codes: "true",
    success_url: `${opts.appUrl}/settings?balcony=welcome`,
    cancel_url: `${opts.appUrl}/settings?balcony=maybe-later`,
  });
}

export async function createPortalSession(opts: {
  customerId: string;
  appUrl: string;
}): Promise<{ url: string }> {
  return stripePost<{ url: string }>("/billing_portal/sessions", {
    customer: opts.customerId,
    return_url: `${opts.appUrl}/settings`,
  });
}

export interface StripeSubscription {
  id: string;
  status: string; // trialing | active | past_due | canceled | ...
  customer: string;
  current_period_end: number; // unix seconds
  trial_end: number | null;
  metadata?: { user_id?: string };
}

export async function getSubscription(id: string): Promise<StripeSubscription> {
  return stripeGet<StripeSubscription>(`/subscriptions/${id}`);
}

/**
 * Verify a Stripe-Signature header against the raw body (HMAC-SHA256 of
 * "<timestamp>.<payload>" with the webhook signing secret). Rejects stale
 * timestamps to blunt replay.
 */
export function verifyWebhookSignature(
  payload: string,
  sigHeader: string | null,
  secret: string,
  toleranceSeconds = 300,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!sigHeader) return false;
  const parts = new Map(
    sigHeader.split(",").map((p) => {
      const [k, ...v] = p.split("=");
      return [k.trim(), v.join("=")] as const;
    }),
  );
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (!t || !v1) return false;
  if (Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(v1, "hex"));
  } catch {
    return false;
  }
}
