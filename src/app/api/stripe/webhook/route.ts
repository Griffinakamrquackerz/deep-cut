import { NextResponse } from "next/server";
import { getSubscription, verifyWebhookSignature, type StripeSubscription } from "@/lib/stripe";
import { setPremium } from "@/lib/premium";
import { track } from "@/lib/analytics";

// Stripe → Deep Cut. Subscription lifecycle sets users.premium_until:
// trialing/active → current_period_end + 3-day grace; canceled/unpaid → now.
// The user id rides on subscription metadata (set at checkout).

const GRACE_MS = 3 * 24 * 60 * 60 * 1000;

function untilFrom(sub: StripeSubscription): string | null {
  if (sub.status === "trialing" || sub.status === "active" || sub.status === "past_due") {
    return new Date(sub.current_period_end * 1000 + GRACE_MS).toISOString();
  }
  return null; // canceled, unpaid, incomplete_expired → lapse immediately
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });

  const payload = await request.text();
  const ok = verifyWebhookSignature(payload, request.headers.get("stripe-signature"), secret);
  if (!ok) return NextResponse.json({ error: "bad_signature" }, { status: 400 });

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as { subscription?: string };
      if (session.subscription) {
        const sub = await getSubscription(session.subscription);
        const userId = sub.metadata?.user_id;
        if (userId) {
          await setPremium(userId, untilFrom(sub), sub.customer);
          await track(userId, "balcony_started", { status: sub.status });
        }
      }
    } else if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object as unknown as StripeSubscription;
      const userId = sub.metadata?.user_id;
      if (userId) {
        await setPremium(userId, untilFrom(sub), sub.customer);
        await track(userId, "balcony_updated", { status: sub.status });
      }
    }
  } catch (err) {
    // Tell Stripe to retry — transient DB/API failures shouldn't drop events.
    return NextResponse.json({ error: String(err).slice(0, 200) }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
