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

export type BalconyPlan = "monthly" | "lifetime" | "support";

/**
 * Floor for pay-what-you-want support.
 *
 * A dollar, because Stripe's per-transaction fee on anything smaller is most
 * of the payment — a 50c contribution would cost the Fund money to accept.
 */
export const SUPPORT_MIN_CENTS = 100;

/**
 * Floor for buying your way past the waitlist.
 *
 * Set to the Ticket Holder tier, so the cheapest thing you can do is also the
 * thing that gets you in tonight — one number to explain instead of two.
 */
export const SKIP_LINE_MIN_CENTS = 500;

/**
 * The currency every charge is created in.
 *
 * One constant rather than two string literals, so charging in anything else
 * later is one edit instead of a hunt. It is NOT yet safe to vary per member:
 * the fund's goal, its progress bar and the vote budget are all denominated in
 * a single currency, so a euro charge would land in the ledger as euro-cents
 * summed into a dollar total. Migration 0024 records the currency and scopes
 * the bar to one, which is the prerequisite; actually charging in more than one
 * needs a conversion story on top of that.
 */
export const CHECKOUT_CURRENCY = "usd";

/**
 * Checkout for somebody who doesn't have an account yet.
 *
 * The ordinary support flow needs a signed-in user, which is circular for a
 * waitlist skip: you can't sign in until you're seated, and you're not seated
 * until you've paid. So this one carries an EMAIL rather than a user id, and
 * the webhook seats them and then attributes the money once the invite has
 * created the account.
 *
 * One-time rather than a subscription, deliberately. A recurring charge would
 * need a user id on the subscription object to survive renewals, and a $5
 * queue-skip shouldn't quietly become a standing order either.
 */
export async function createSkipLineSession(opts: {
  email: string;
  amountCents: number;
  appUrl: string;
}): Promise<{ url: string }> {
  const cents = Math.floor(opts.amountCents);
  if (!Number.isFinite(cents) || cents < SKIP_LINE_MIN_CENTS) {
    throw new Error(`skip-line amount must be at least ${SKIP_LINE_MIN_CENTS} cents`);
  }
  const email = opts.email.trim().toLowerCase();

  return stripePost<{ url: string }>("/checkout/sessions", {
    mode: "payment",
    customer_email: email,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": CHECKOUT_CURRENCY,
    "line_items[0][price_data][unit_amount]": String(cents),
    "line_items[0][price_data][product_data][name]":
      "Deep Cut — Indie Film Fund support (seated tonight)",
    // The webhook keys off skip_line; email is how it knows who to seat, since
    // there is no user to reference yet.
    "metadata[skip_line]": "1",
    "metadata[email]": email,
    "payment_intent_data[metadata][skip_line]": "1",
    "payment_intent_data[metadata][email]": email,
    // /seated, not /welcome: they have no account yet and are not signed in,
    // so /welcome would bounce them straight to /login moments after paying.
    success_url: `${opts.appUrl}/seated`,
    cancel_url: `${opts.appUrl}/?skip=cancelled`,
  });
}

/** Far-future stamp = "lifetime" (premium status is a timestamp, not a flag). */
export const LIFETIME_UNTIL = "2099-12-31T00:00:00.000Z";

export function lifetimeConfigured(): boolean {
  return !!process.env.STRIPE_PRICE_ID_LIFETIME;
}

export async function createCheckoutSession(opts: {
  userId: string;
  email: string;
  appUrl: string;
  plan?: BalconyPlan;
  /**
   * Pay-what-you-want, in cents, for the "support" plan.
   *
   * The price is built inline rather than picked from a list of preset Price
   * objects, because the whole point is that the member names the number. A
   * fixed ladder of tiers would be a pricing page wearing a donation's clothes.
   */
  amountCents?: number;
}): Promise<{ url: string }> {
  const plan = opts.plan ?? "monthly";
  const common = {
    "line_items[0][quantity]": "1",
    customer_email: opts.email,
    client_reference_id: opts.userId,
    // Session-level metadata so BOTH flows can resolve the user in the webhook
    // (subscriptions also carry it on the subscription object).
    "metadata[user_id]": opts.userId,
    "metadata[plan]": plan,
    allow_promotion_codes: "true",
    success_url: `${opts.appUrl}/settings?balcony=welcome`,
    cancel_url: `${opts.appUrl}/settings?balcony=maybe-later`,
  };

  if (plan === "lifetime") {
    const priceId = process.env.STRIPE_PRICE_ID_LIFETIME;
    if (!priceId) throw new Error("STRIPE_PRICE_ID_LIFETIME not set");
    return stripePost<{ url: string }>("/checkout/sessions", {
      ...common,
      mode: "payment",
      "line_items[0][price]": priceId,
      "payment_intent_data[metadata][user_id]": opts.userId,
    });
  }

  if (plan === "support") {
    // A floor, not a suggestion: below a dollar the card fee eats the whole
    // contribution and the Fund gets less than nothing.
    const cents = Math.floor(opts.amountCents ?? 0);
    if (!Number.isFinite(cents) || cents < SUPPORT_MIN_CENTS) {
      throw new Error(`support amount must be at least ${SUPPORT_MIN_CENTS} cents`);
    }
    return stripePost<{ url: string }>("/checkout/sessions", {
      ...common,
      mode: "subscription",
      "line_items[0][price_data][currency]": CHECKOUT_CURRENCY,
      "line_items[0][price_data][unit_amount]": String(cents),
      "line_items[0][price_data][recurring][interval]": "month",
      "line_items[0][price_data][product_data][name]": "Deep Cut — monthly support",
      "subscription_data[metadata][user_id]": opts.userId,
      "subscription_data[metadata][plan]": "support",
    });
  }

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) throw new Error("STRIPE_PRICE_ID not set");
  return stripePost<{ url: string }>("/checkout/sessions", {
    ...common,
    mode: "subscription",
    "line_items[0][price]": priceId,
    "subscription_data[trial_period_days]": String(TRIAL_DAYS),
    "subscription_data[metadata][user_id]": opts.userId,
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
  // Stripe moved current_period_end out of the top level in recent API
  // versions (it now lives on each item). Keep both shapes optional and read
  // whichever is present — see periodEndSeconds() in the webhook.
  current_period_end?: number; // unix seconds (older API versions)
  items?: { data?: Array<{ current_period_end?: number }> };
  trial_end?: number | null;
  metadata?: { user_id?: string; plan?: string };
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
