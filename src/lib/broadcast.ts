import type { SupabaseClient } from "@supabase/supabase-js";
import { mapWithConcurrency, pushConfigured, sendPush, type PushSub } from "@/lib/push";
import { activeExpoTokens, sendExpoPush } from "@/lib/expo-push";

// Push to EVERYBODY who has opted in, over both channels.
//
// pushToUser handles "something happened to you". The Friday Night Deal cron
// handles "it's Friday". This is the third shape: a one-off announcement the
// house decides to make, sent by a person pressing a button rather than by a
// schedule — which is exactly why it needs guards a cron doesn't.
//
// Having a subscription or a live token IS the opt-in; they're only written
// when somebody turns notifications on. There is no separate flag to check.
//
// NOTE: api/cron/friday-deal still has its own copy of this fan-out. It works
// and it runs weekly in production, so it isn't being rewritten in the same
// change that introduces this. Moving it onto broadcast() is a worthwhile
// follow-up — two fan-outs will drift eventually.

export interface Announcement {
  title: string;
  body: string;
  /** Site-relative landing path, e.g. "/submit". */
  path: string;
  /**
   * Groups replacing notifications on the lock screen.
   *
   * Unique per announcement, so sending the open call and then the ballot
   * doesn't have the second silently replace the first.
   */
  tag: string;
}

export interface Reach {
  /** Distinct people who would receive this. */
  people: number;
  /** Browser subscriptions. One person can have several. */
  webDevices: number;
  /** Live Expo tokens (the app). */
  nativeDevices: number;
}

/**
 * Who would get it, without sending anything.
 *
 * The whole reason the send endpoint defaults to a dry run: pressing a button
 * that pushes to every phone in the building deserves to show you the number
 * first. A broadcast cannot be recalled — there is no unsend on a lock screen.
 */
export async function reach(db: SupabaseClient): Promise<Reach> {
  let webSubs: Array<{ user_id: string }> = [];
  if (pushConfigured()) {
    const { data } = await db.from("push_subscriptions").select("user_id");
    webSubs = (data ?? []) as typeof webSubs;
  }
  const expo = await activeExpoTokens(db);
  const people = new Set([...webSubs.map((s) => s.user_id), ...expo.map((e) => e.userId)]);
  return { people: people.size, webDevices: webSubs.length, nativeDevices: expo.length };
}

export interface BroadcastResult {
  web: { sent: number; pruned: number };
  native: { sent: number; dead: number };
  people: number;
}

/**
 * Send it. Prunes dead endpoints and tokens as it discovers them.
 *
 * Fails soft per device, never in aggregate: one browser refusing a push must
 * not stop the other nine hundred. A channel that isn't configured
 * contributes zero rather than throwing.
 */
export async function broadcast(
  db: SupabaseClient,
  msg: Announcement,
  siteBase: string,
): Promise<BroadcastResult> {
  const url = `${siteBase}${msg.path}`;

  let webSubs: Array<{ endpoint: string; user_id: string; p256dh: string; auth: string }> = [];
  if (pushConfigured()) {
    const { data } = await db
      .from("push_subscriptions")
      .select("endpoint, user_id, p256dh, auth");
    webSubs = (data ?? []) as typeof webSubs;
  }
  const expo = await activeExpoTokens(db);
  const people = new Set([...webSubs.map((s) => s.user_id), ...expo.map((e) => e.userId)]).size;

  // ── Browsers ──
  // 20 at a time, matching the Friday cron: quick enough for a few thousand
  // subscribers inside the function budget, bounded so we aren't opening a
  // thousand sockets at once.
  let webSent = 0;
  const expired: string[] = [];
  const results = await mapWithConcurrency(webSubs, 20, async (s) => {
    const sub: PushSub = { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth };
    const result = await sendPush(sub, {
      title: msg.title,
      body: msg.body,
      url,
      tag: msg.tag,
    });
    return { endpoint: s.endpoint, result };
  });
  for (const r of results) {
    if (r.result === "sent") webSent++;
    else if (r.result === "expired") expired.push(r.endpoint);
  }
  if (expired.length) {
    await db.from("push_subscriptions").delete().in("endpoint", expired);
  }

  // ── The app ──
  let nativeSent = 0;
  let dead: string[] = [];
  if (expo.length) {
    const r = await sendExpoPush(
      expo.map((e) => ({
        to: e.token,
        title: msg.title,
        body: msg.body,
        data: { url, path: msg.path },
      })),
    );
    nativeSent = r.sent;
    dead = r.dead;
    // Retire a dead token with a newer disabled event so it drops out of the
    // next send rather than being retried forever.
    for (const token of dead) {
      const owner = expo.find((e) => e.token === token)?.userId;
      if (owner) {
        await db
          .from("events")
          .insert({ user_id: owner, name: "expo_push_token", props: { token, enabled: false } });
      }
    }
  }

  return {
    web: { sent: webSent, pruned: expired.length },
    native: { sent: nativeSent, dead: dead.length },
    people,
  };
}

const SENT_EVENT = "announcement_sent";

/**
 * Has this exact announcement already gone out?
 *
 * Keyed on the campaign and the round, so "the open call for film-01" can be
 * sent once. This is the guard that matters most in the whole file: the
 * failure it prevents is a double-tap, a browser retry or a second admin
 * putting the same notification on everybody's phone twice, which reads as
 * broken to every single recipient and cannot be undone.
 */
export async function alreadySent(db: SupabaseClient, key: string): Promise<string | null> {
  const { data, error } = await db
    .from("events")
    .select("created_at")
    .eq("name", SENT_EVENT)
    .contains("props", { key })
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  return String(data[0].created_at);
}

/** Record that it went, so alreadySent can see it. */
export async function markSent(
  db: SupabaseClient,
  key: string,
  userId: string,
  result: BroadcastResult,
): Promise<void> {
  const { error } = await db.from("events").insert({
    user_id: userId,
    name: SENT_EVENT,
    props: { key, web: result.web.sent, native: result.native.sent, people: result.people },
  });
  // Logged loudly rather than swallowed: if this insert fails the push has
  // ALREADY gone out, and the guard above will happily let it go again.
  if (error) console.error(`announcement ${key} sent but not recorded: ${error.message}`);
}
