import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { mapWithConcurrency, pushConfigured, sendPush, type PushSub } from "@/lib/push";
import { activeExpoTokens, sendExpoPush } from "@/lib/expo-push";
import { siteUrl } from "@/lib/site";
import { featureOfWeek } from "@/lib/shorts";
import { programmeShowing } from "@/lib/shorts-admin";

// The Friday Night Deal — a weekly nudge that fires when people are actually
// deciding what to watch. Wired to a Vercel Cron (see vercel.json). Auth is a
// bearer CRON_SECRET so nobody can spam the whole user base by hitting the URL.
//
// Sends over both channels, independently: web push (browser, needs VAPID) and
// Expo push (the native app). Fails soft everywhere — a missing channel or an
// unapplied migration just contributes zero instead of erroring. Dead
// endpoints/tokens are pruned as we discover them.
export const dynamic = "force-dynamic";
// This fans out to every subscriber. Without a ceiling it took Vercel's
// default, which killed the run partway down the list — half the house got
// their Friday push and nothing recorded that the other half didn't.
export const maxDuration = 300;

export async function GET(req: Request) {
  // Fail CLOSED. This used to be `if (secret) { ...check... }`, so a
  // deployment with no CRON_SECRET set skipped the check entirely — and
  // /api/version published `cronSecret: false` to anybody who asked, which
  // turned "is this open?" into a single unauthenticated request. Anyone could
  // then drive this route directly: push-notify every subscriber in a loop,
  // mail the whole list, or burn the day's invite allowance.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();

  // Gather recipients across both channels.
  let webSubs: Array<{ endpoint: string; user_id: string; p256dh: string; auth: string }> = [];
  if (pushConfigured()) {
    const { data } = await db
      .from("push_subscriptions")
      .select("endpoint, user_id, p256dh, auth");
    webSubs = (data ?? []) as typeof webSubs;
  }
  const expo = await activeExpoTokens(db);

  const userIds = [...new Set([...webSubs.map((s) => s.user_id), ...expo.map((e) => e.userId)])];
  if (userIds.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  // One fresh deep cut per user, newest first, so the push names a real movie.
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

  // The week's feature from Deep Cut Theatre leads, when there is one: it's a
  // specific film you can watch in the room right now, which beats a
  // recommendation you still have to go and find. The personal rec is the
  // fallback for a week with an empty bill.
  const feature = featureOfWeek(await programmeShowing().catch(() => []));

  const bodyFor = (uid: string) => {
    if (feature) {
      return `This week at the Theatre: ${feature.title} (${feature.director}). ${feature.pedigree}`;
    }
    const title = titleByUser.get(uid);
    return title
      ? `Tonight's deep cut: ${title}. Tap to deal your night.`
      : "Your Friday deep cut is ready. Tap to deal your night.";
  };
  const headline = feature ? "🎬 This week at the Theatre" : "🎬 Friday Night Deal";
  const landing = feature ? `${base}/tv?utm=friday_push` : `${base}/?utm=friday_push`;

  // ── Web push ──
  let webSent = 0;
  const webExpired: string[] = [];
  // 20 at a time: fast enough that a few thousand subscribers finish well
  // inside the budget, bounded so we're not opening a thousand sockets at once.
  const results = await mapWithConcurrency(webSubs, 20, async (s) => {
    const sub: PushSub = { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth };
    const result = await sendPush(sub, {
      title: headline,
      body: bodyFor(s.user_id),
      url: landing,
      tag: "friday-deal",
    });
    return { endpoint: s.endpoint, result };
  });
  for (const r of results) {
    if (r.result === "sent") webSent++;
    else if (r.result === "expired") webExpired.push(r.endpoint);
  }
  if (webExpired.length) {
    await db.from("push_subscriptions").delete().in("endpoint", webExpired);
  }

  // ── Expo (native) push ──
  let expoSent = 0;
  let expoDead: string[] = [];
  if (expo.length) {
    const messages = expo.map((e) => ({
      to: e.token,
      title: headline,
      body: bodyFor(e.userId),
      data: { url: landing, path: feature ? "/tv" : "/" },
    }));
    const r = await sendExpoPush(messages);
    expoSent = r.sent;
    expoDead = r.dead;
    // Retire dead tokens with a newer disabled event so they drop out next time.
    for (const token of expoDead) {
      const owner = expo.find((e) => e.token === token)?.userId;
      if (owner) {
        await db
          .from("events")
          .insert({ user_id: owner, name: "expo_push_token", props: { token, enabled: false } });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    web: { sent: webSent, pruned: webExpired.length },
    expo: { sent: expoSent, dead: expoDead.length },
  });
}
