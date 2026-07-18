import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { createPortalSession } from "@/lib/stripe";
import { getPremium } from "@/lib/premium";

/** Stripe billing portal — manage/cancel the Balcony Seats subscription. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { stripeCustomerId } = await getPremium(user.id);
  if (!stripeCustomerId) {
    return NextResponse.json({ error: "no_subscription" }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  try {
    const session = await createPortalSession({ customerId: stripeCustomerId, appUrl });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 200) }, { status: 502 });
  }
}
