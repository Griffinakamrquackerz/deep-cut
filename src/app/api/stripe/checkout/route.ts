import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import {
  createCheckoutSession,
  lifetimeConfigured,
  SUPPORT_MIN_CENTS,
  type BalconyPlan,
} from "@/lib/stripe";
import { premiumConfigured } from "@/lib/premium";
import { track } from "@/lib/analytics";

/** Start Balcony Seats checkout: monthly ($3.99, 3 free months) or the $150
 *  one-time lifetime pass. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    plan?: string;
    amountCents?: number;
  };
  const plan: BalconyPlan =
    body.plan === "lifetime" ? "lifetime" : body.plan === "support" ? "support" : "monthly";

  // Support builds its price inline, so it needs a secret key but no preset
  // Price object — it works on a deployment that never configured STRIPE_PRICE_ID.
  const ready =
    plan === "lifetime"
      ? lifetimeConfigured()
      : plan === "support"
        ? !!process.env.STRIPE_SECRET_KEY
        : premiumConfigured();
  if (!ready) {
    return NextResponse.json({ error: "premium_not_configured" }, { status: 503 });
  }

  const amountCents = plan === "support" ? Math.floor(Number(body.amountCents)) : undefined;
  if (plan === "support" && (!Number.isFinite(amountCents!) || amountCents! < SUPPORT_MIN_CENTS)) {
    return NextResponse.json(
      { error: "amount_too_small", minCents: SUPPORT_MIN_CENTS },
      { status: 400 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  try {
    const session = await createCheckoutSession({
      userId: user.id,
      email: user.email ?? "",
      appUrl,
      plan,
      amountCents,
    });
    await track(user.id, "balcony_checkout_started", { plan, amountCents });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 200) }, { status: 502 });
  }
}
