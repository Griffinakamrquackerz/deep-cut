// Balcony Seats — premium status. Columns (migration 0005) are the home;
// the events table is the zero-migration fallback, same latest-wins pattern
// as profile styles. Status is a timestamp, not a boolean: premium_until in
// the future = in the balcony. Webhooks extend it; lapse just… lapses.

import { supabaseAdmin } from "./supabase/admin";

const EVENT = "premium_status";

export interface PremiumState {
  premiumUntil: string | null; // ISO
  stripeCustomerId: string | null;
}

export function premiumConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

async function readFallback(userId: string): Promise<PremiumState> {
  const { data } = await supabaseAdmin()
    .from("events")
    .select("props")
    .eq("user_id", userId)
    .eq("name", EVENT)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const p = (data?.props ?? {}) as Record<string, unknown>;
  return {
    premiumUntil: typeof p.premium_until === "string" ? p.premium_until : null,
    stripeCustomerId: typeof p.stripe_customer_id === "string" ? p.stripe_customer_id : null,
  };
}

export async function getPremium(userId: string): Promise<PremiumState> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("users")
    .select("premium_until, stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();
  if (!error && data && (data.premium_until || data.stripe_customer_id)) {
    return {
      premiumUntil: (data.premium_until as string | null) ?? null,
      stripeCustomerId: (data.stripe_customer_id as string | null) ?? null,
    };
  }
  // Columns missing (pre-0005) or empty — consult the fallback either way.
  return readFallback(userId);
}

export async function isPremium(userId: string): Promise<boolean> {
  const { premiumUntil } = await getPremium(userId);
  return !!premiumUntil && new Date(premiumUntil).getTime() > Date.now();
}

export async function setPremium(
  userId: string,
  premiumUntil: string | null,
  stripeCustomerId: string | null,
): Promise<boolean> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("users")
    .update({ premium_until: premiumUntil, stripe_customer_id: stripeCustomerId })
    .eq("id", userId);
  if (!error) return true;
  // Pre-0005: persist as an event instead.
  const { error: evErr } = await db.from("events").insert({
    user_id: userId,
    name: EVENT,
    props: { premium_until: premiumUntil, stripe_customer_id: stripeCustomerId },
  });
  return !evErr;
}
