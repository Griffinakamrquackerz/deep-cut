import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { createCheckoutSession } from "@/lib/stripe";
import { premiumConfigured } from "@/lib/premium";
import { track } from "@/lib/analytics";

/** Start the Balcony Seats checkout: 3 free months, then $4.99/mo. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!premiumConfigured()) {
    return NextResponse.json({ error: "premium_not_configured" }, { status: 503 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  try {
    const session = await createCheckoutSession({
      userId: user.id,
      email: user.email ?? "",
      appUrl,
    });
    await track(user.id, "balcony_checkout_started", {});
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 200) }, { status: 502 });
  }
}
