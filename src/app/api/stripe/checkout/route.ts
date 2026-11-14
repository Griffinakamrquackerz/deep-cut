import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import {
  createCheckoutSession,
  annualConfigured,
  lifetimeConfigured,
  SUPPORT_MIN_CENTS,
  SUPPORT_MAX_CENTS,
  validateLifetimePrice,
  validateAnnualPrice,
  type BalconyPlan,
} from "@/lib/stripe";
import { premiumConfigured } from "@/lib/premium";
import { track } from "@/lib/analytics";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Start subscription, lifetime, or optional support checkout. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    plan?: string;
    amountCents?: number;
  };
  const plan: BalconyPlan =
    body.plan === "lifetime" ? "lifetime" : body.plan === "annual" ? "annual" : body.plan === "support" ? "support" :
      body.plan === "donation" ? "donation" : body.plan === "points" ? "points" : "monthly";

  // Support builds its price inline, so it needs a secret key but no preset
  // Price object — it works on a deployment that never configured STRIPE_PRICE_ID.
  const ready =
    plan === "lifetime"
      ? lifetimeConfigured()
      : plan === "annual" ? annualConfigured()
      : plan === "support" || plan === "donation" || plan === "points"
        ? !!process.env.STRIPE_SECRET_KEY
        : premiumConfigured();
  if (!ready) {
    return NextResponse.json({ error: "premium_not_configured" }, { status: 503 });
  }

  const amountCents = plan === "support" || plan === "donation" || plan === "points" ? body.amountCents : undefined;
  if ((plan === "support" || plan === "donation" || plan === "points") &&
      (typeof amountCents !== "number" || !Number.isSafeInteger(amountCents) ||
       amountCents < SUPPORT_MIN_CENTS || amountCents > SUPPORT_MAX_CENTS)) {
    return NextResponse.json(
      { error: "invalid_amount", minCents: SUPPORT_MIN_CENTS, maxCents: SUPPORT_MAX_CENTS },
      { status: 400 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  try {
    let lifetimeReservation: { id: string; expiresAt: number } | undefined;
    if (plan === "annual") await validateAnnualPrice();
    if (plan === "lifetime") {
      await validateLifetimePrice();
      const { data, error } = await supabaseAdmin().rpc("reserve_lifetime_slot", { p_user_id: user.id });
      if (error) {
        console.error("lifetime reservation failed", error.message);
        return NextResponse.json({ error: "lifetime_unavailable" }, { status: 503 });
      }
      const slot = data?.[0] as { result: string; reservation_id: string | null; reserved_at: string | null } | undefined;
      if (!slot) return NextResponse.json({ error: "lifetime_unavailable" }, { status: 503 });
      if (slot.result === "sold_out" || slot.result === "purchased") {
        return NextResponse.json({ error: slot.result === "sold_out" ? "lifetime_sold_out" : "lifetime_already_owned" }, { status: 409 });
      }
      if (slot.result !== "pending" || !slot.reservation_id || !slot.reserved_at) {
        return NextResponse.json({ error: "lifetime_unavailable" }, { status: 503 });
      }
      const expiresAt = Math.floor(new Date(slot.reserved_at).getTime() / 1000) + 45 * 60;
      if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000) + 30 * 60) {
        return NextResponse.json({ error: "lifetime_reservation_pending" }, { status: 409 });
      }
      lifetimeReservation = { id: slot.reservation_id, expiresAt };
    }
    const session = await createCheckoutSession({
      userId: user.id,
      email: user.email ?? "",
      appUrl,
      plan,
      amountCents,
      lifetimeReservation,
    });
    await track(user.id, "balcony_checkout_started", { plan, amountCents });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 200) }, { status: 502 });
  }
}
