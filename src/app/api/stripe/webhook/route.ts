import { NextResponse } from "next/server";
import {
  getSubscription,
  verifyWebhookSignature,
  LIFETIME_UNTIL,
  type StripeSubscription,
} from "@/lib/stripe";
import { setPremium } from "@/lib/premium";
import { recordContribution, premiumUntilFor, premiumMonthsFor } from "@/lib/fund";
import { approveEmail } from "@/lib/waitlist";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { track } from "@/lib/analytics";

// Stripe → Deep Cut. Subscription lifecycle sets users.premium_until:
// trialing/active → current_period_end + 3-day grace; canceled/unpaid → now.
// The user id rides on subscription metadata (set at checkout).

const GRACE_MS = 3 * 24 * 60 * 60 * 1000;
const FALLBACK_MS = 35 * 24 * 60 * 60 * 1000; // if Stripe gives us no period end

// Period end has lived in three places across Stripe API versions: top-level
// current_period_end (older), items.data[].current_period_end (newer/basil+),
// and trial_end during a trial. Read whichever is present; never return NaN.
function periodEndSeconds(sub: StripeSubscription): number | null {
  if (typeof sub.current_period_end === "number") return sub.current_period_end;
  const itemEnd = sub.items?.data?.[0]?.current_period_end;
  if (typeof itemEnd === "number") return itemEnd;
  if (typeof sub.trial_end === "number") return sub.trial_end;
  return null;
}

function untilFrom(sub: StripeSubscription): string | null {
  if (sub.status === "trialing" || sub.status === "active" || sub.status === "past_due") {
    const end = periodEndSeconds(sub);
    // Grant access from the real period end when we have it; otherwise a safe
    // window so a missing field can never lock out a paying member.
    const baseMs = end != null ? end * 1000 : Date.now() + FALLBACK_MS;
    return new Date(baseMs + GRACE_MS).toISOString();
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
      const session = event.data.object as {
        id?: string;
        subscription?: string;
        mode?: string;
        amount_total?: number;
        // Stripe's own answer, not ours. If a charge ever settles in something
        // other than the fund's currency, the ledger has to know — see
        // migration 0024.
        currency?: string;
        customer_email?: string;
        client_reference_id?: string;
        metadata?: { user_id?: string; plan?: string; skip_line?: string; email?: string };
      };
      // ── Bought their way past the waitlist ──
      //
      // Handled before anything else because this session has no user id at
      // all — the account doesn't exist yet. The order matters: seat them
      // first, because approveEmail creates the auth user (and the trigger on
      // auth.users creates the public.users row) that the fund ledger needs a
      // foreign key to. Attribute the money second.
      if (session.metadata?.skip_line === "1") {
        const email = (session.metadata?.email ?? session.customer_email ?? "")
          .trim()
          .toLowerCase();
        if (!email) {
          console.error("skip_line session with no email", session.id);
          return NextResponse.json({ received: true });
        }

        const seated = await approveEmail(email);
        if (!seated.ok) {
          // Their money is taken and they are not in. Returning 500 makes
          // Stripe retry, which retries the invite — the right outcome, since
          // approveEmail is safe to run twice and the alternative is somebody
          // paying for a seat they never get.
          console.error(`skip_line: paid but not seated (${email}): ${seated.note}`);
          return NextResponse.json({ error: "seating_failed", note: seated.note }, { status: 500 });
        }

        const db = supabaseAdmin();

        // approveEmail hands back the id it just seated, which is the only
        // reliable way to get it: the public.users row is created by a trigger
        // on auth.users, so looking it up by email races the trigger AND
        // depends on users.email existing at all (migration 0018). Falling
        // back to the lookup covers an already-registered address whose link
        // came back without a user object.
        let userId = seated.userId;
        if (!userId) {
          const { data: row } = await db
            .from("users")
            .select("id")
            .eq("email", email)
            .maybeSingle();
          if (row?.id) userId = String(row.id);
        }

        if (userId) {
          const gross = Number(session.amount_total ?? 0);
          await recordContribution(db, {
            userId,
            grossCents: gross,
            kind: "donation",
            stripeRef: `cs_${session.id ?? ""}`,
            currency: session.currency,
          });
          // Unlock the full app too. The landing page promises a donation does
          // more than buy a vote, and until now that was only true of the
          // monthly plan — a one-time supporter got seated, earned votes, and
          // still saw ads. Nobody has an existing window here: the account was
          // created seconds ago by approveEmail.
          const { data: current } = await db
            .from("users")
            .select("premium_until")
            .eq("id", userId)
            .maybeSingle();
          await setPremium(
            userId,
            premiumUntilFor(gross, (current?.premium_until as string | null) ?? null),
            null,
          );
          await track(userId, "skip_line_seated", {
            cents: gross,
            months: premiumMonthsFor(gross),
          });
        } else {
          // Seated but unattributable. Logged loudly rather than swallowed:
          // the bar and their votes are both wrong until somebody looks.
          console.error(`skip_line: seated ${email} but found no users row to credit`);
        }
        return NextResponse.json({ received: true });
      }

      if (session.subscription) {
        // Monthly subscription — status drives premium_until.
        const sub = await getSubscription(session.subscription);
        const userId = sub.metadata?.user_id;
        if (userId) {
          await setPremium(userId, untilFrom(sub), sub.customer);
          await track(userId, "balcony_started", { status: sub.status });
        }
      } else {
        // One-time payment (the $150 lifetime pass) — no subscription object,
        // so read the user id off the session and grant lifetime access.
        const userId = session.metadata?.user_id ?? session.client_reference_id;
        if (userId) {
          await setPremium(userId, LIFETIME_UNTIL, null);
          await track(userId, "balcony_lifetime", {});
          // A one-time payment has no invoice cycle, so the Fund's share is
          // taken here. Keyed on the session id so a redelivered webhook can't
          // count it twice.
          await recordContribution(supabaseAdmin(), {
            userId,
            grossCents: Number(session.amount_total ?? 0),
            kind: "lifetime",
            stripeRef: `cs_${session.id ?? ""}`,
            currency: session.currency,
          });
        }
      }
    } else if (event.type === "invoice.payment_succeeded") {
      // The Fund grows HERE, not at checkout.
      //
      // checkout.session.completed fires once, ever. A monthly subscription
      // pays every month, and each of those payments is real money the Fund
      // gets a share of — so the ledger follows the invoices. This also covers
      // the first charge, which means nothing has to be recorded at checkout
      // for a subscription at all.
      const invoice = event.data.object as {
        id?: string;
        amount_paid?: number;
        currency?: string;
        // Pre-basil. Stripe's 2025-03-31.basil release REMOVED this field.
        subscription?: string;
        // basil and later. The subscription moved onto `parent`, in the same
        // release that moved current_period_end onto items[] — the relocation
        // periodEndSeconds() above already compensates for, which is how we
        // know this deployment is very likely on basil or later.
        parent?: { subscription_details?: { subscription?: string } };
        billing_reason?: string;
      };

      // Read both shapes.
      //
      // This is where every subscription dollar reaches the Fund: the $3.99
      // plan and pay-what-you-want support both. Reading only the pre-basil
      // field meant that on a basil endpoint the branch never fired — the bar
      // counted no subscription money at all and every monthly subscriber
      // earned zero votes, against a page promising "$1 = 1 vote".
      const subId = invoice.subscription ?? invoice.parent?.subscription_details?.subscription;

      if (subId && Number(invoice.amount_paid) > 0) {
        const sub = await getSubscription(subId);
        const userId = sub.metadata?.user_id;
        if (userId) {
          await recordContribution(supabaseAdmin(), {
            userId,
            grossCents: Number(invoice.amount_paid),
            // Pay-what-you-want support and the fixed monthly plan are the
            // same thing to the Fund; the plan tag is what tells them apart.
            kind: sub.metadata?.plan === "support" ? "donation" : "subscription",
            stripeRef: `in_${invoice.id ?? ""}`,
            currency: invoice.currency,
          });
        } else {
          // A subscription invoice with no user id on it. Nothing to credit,
          // so the money is real and the ledger doesn't know — logged loudly
          // rather than dropped, because a silent version of exactly this is
          // what hid the basil field change.
          console.error(`invoice ${invoice.id} paid on sub ${subId} with no user_id in metadata`);
        }
      } else if (Number(invoice.amount_paid) > 0) {
        // Paid, and we could not find a subscription on it in EITHER shape.
        // That is the alarm the basil change needed and didn't have.
        console.error(
          `invoice ${invoice.id} paid ${invoice.amount_paid} but no subscription id found on either invoice.subscription or invoice.parent.subscription_details — nothing recorded to the Fund`,
        );
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
