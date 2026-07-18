import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { pushConfigured, sendPush, type PushSub } from "@/lib/push";
import { siteUrl } from "@/lib/site";

// The Friday Night Deal — a weekly nudge that fires when people are actually
// deciding what to watch. Wired to a Vercel Cron (see vercel.json). Auth is a
// bearer CRON_SECRET so nobody can spam the whole user base by hitting the URL.
//
// Fails soft everywhere: if push isn't configured, or migration 0005 isn't
// applied, it returns a clean summary instead of erroring. Expired
// subscriptions are pruned as we discover them.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  if (!pushConfigured()) {
    return NextResponse.json({ ok: true, skipped: "push_not_configured", sent: 0 });
  }

  const db = supabaseAdmin();
  const { data: subs, error } = await db
    .from("push_subscriptions")
    .select("endpoint, user_id, p256dh, auth");
  if (error) {
    return NextResponse.json({ ok: true, skipped: "no_subscriptions_table", sent: 0 });
  }
  if (!subs?.length) return NextResponse.json({ ok: true, sent: 0 });

  // One fresh deep cut per subscribed user, newest first, so the push can name
  // an actual movie instead of a generic "come back".
  const userIds = [...new Set(subs.map((s) => s.user_id as string))];
  const { data: recs } = await db
    .from("recommendations")
    .select("user_id, created_at, movies(title)")
    .in("user_id", userIds)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const titleByUser = new Map<string, string>();
  for (const r of recs ?? []) {
    const uid = r.user_id as string;
    if (titleByUser.has(uid)) continue; // first == newest
    const title = (r.movies as unknown as { title?: string } | null)?.title;
    if (title) titleByUser.set(uid, title);
  }

  const base = siteUrl();
  let sent = 0;
  const expired: string[] = [];

  for (const s of subs) {
    const title = titleByUser.get(s.user_id as string);
    const payload = {
      title: "🎬 Friday Night Deal",
      body: title
        ? `Tonight's deep cut: ${title}. Tap to deal your night.`
        : "Your Friday deep cut is ready. Tap to deal your night.",
      url: `${base}/?utm=friday_push`,
      tag: "friday-deal",
    };
    const sub: PushSub = {
      endpoint: s.endpoint as string,
      p256dh: s.p256dh as string,
      auth: s.auth as string,
    };
    const result = await sendPush(sub, payload);
    if (result === "sent") sent++;
    else if (result === "expired") expired.push(sub.endpoint);
  }

  if (expired.length) {
    await db.from("push_subscriptions").delete().in("endpoint", expired);
  }

  return NextResponse.json({ ok: true, sent, pruned: expired.length, subs: subs.length });
}
