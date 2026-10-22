import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { pushConfigured } from "@/lib/push";
import { pushToUser } from "@/lib/push-user";
import { siteUrl } from "@/lib/site";

// Send yourself a push, and say exactly what happened.
//
// Testing push otherwise takes two people, two browsers and a lot of guessing
// about which of the six things in the chain is broken. This does the same
// send the real ones do and reports the count per channel, so "nothing
// arrived" separates into "nothing was sent" (zero devices — you never opted
// in on this browser) and "sent but not shown" (a browser or OS problem).
//
// Admin only. It can only ever push to the caller.

export const dynamic = "force-dynamic";

export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!pushConfigured()) {
    return NextResponse.json({
      ok: false,
      reason: "no_vapid",
      note: "VAPID keys aren't set on the server, so nothing can be sent.",
    });
  }

  const db = supabaseAdmin();
  const { count: subs } = await db
    .from("push_subscriptions")
    .select("endpoint", { count: "exact", head: true })
    .eq("user_id", admin.id);

  const result = await pushToUser(
    db,
    admin.id,
    {
      title: "🎬 Deep Cut test",
      body: "If you're reading this, push works.",
      path: "/lobby",
      tag: `test-${Date.now()}`, // never collapse two tests into one
    },
    siteUrl(),
  );

  return NextResponse.json({
    ok: result.web + result.native > 0,
    // Devices registered vs messages actually accepted. Registered but zero
    // sent means the subscription is stale — usually a rotated VAPID key.
    browsersRegistered: subs ?? 0,
    sentToBrowsers: result.web,
    sentToApp: result.native,
    note:
      (subs ?? 0) === 0
        ? "This account has no browser subscribed. Turn on Alerts in Settings first."
        : result.web + result.native === 0
          ? "Subscribed but nothing sent — the subscription is probably stale. Toggle Alerts off and on."
          : "Sent. It should appear within a few seconds.",
  });
}
