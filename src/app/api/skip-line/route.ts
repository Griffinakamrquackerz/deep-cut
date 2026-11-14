import { NextResponse } from "next/server";
import { z } from "zod";
import { createSkipLineSession, SKIP_LINE_MIN_CENTS } from "@/lib/stripe";

// Donate and get seated tonight, without an account.
//
// Deliberately unauthenticated — needing to be signed in would defeat the
// entire point, since being signed in is what this buys. Nothing is created
// here: the route only opens a Stripe Checkout session. The account is made by
// the webhook, after the money has actually arrived, so hitting this endpoint
// repeatedly costs nothing and grants nothing.

export const dynamic = "force-dynamic";

const Input = z.object({
  email: z.string().email().max(200),
  amountCents: z.number().int().min(SKIP_LINE_MIN_CENTS).max(2_500_000),
});

export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "payments_not_configured" }, { status: 503 });
  }

  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", minCents: SKIP_LINE_MIN_CENTS },
      { status: 400 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  try {
    const session = await createSkipLineSession({
      email: parsed.data.email,
      amountCents: parsed.data.amountCents,
      appUrl,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 200) }, { status: 502 });
  }
}
