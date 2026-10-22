import type { SupabaseClient } from "@supabase/supabase-js";
import { pushConfigured, sendPush, type PushSub } from "@/lib/push";
import { sendExpoPush } from "@/lib/expo-push";

// Push to ONE person, across every device they've opted in on.
//
// The Friday Night Deal fans out to everybody at once from a cron; this is the
// other shape — something happened to you specifically, and it should reach
// whichever of your devices is nearby. Both channels are tried independently,
// so somebody signed in on the web and in the app gets it in both places.
//
// Having a subscription or a token IS the opt-in: they're only stored after
// somebody turns notifications on, and turning them off deletes the row or
// writes a newer disabled event. There is no separate permission to check.
//
// Everything fails soft. A push is the last and least important step of an
// action that has already happened — the film is sent, the comment is posted —
// so nothing here is allowed to throw or to hold up a response.

export interface UserPush {
  title: string;
  body: string;
  /** Where tapping it should land, as a site-relative path. */
  path: string;
  /**
   * Groups replacing notifications. Two different people sending you two
   * different films must NOT share a tag, or the second silently replaces the
   * first on the lock screen — the service worker sets renotify.
   */
  tag: string;
}

const EVENT = "expo_push_token";

/** That user's Expo tokens, newest state per token wins, disabled ones dropped. */
async function expoTokensFor(db: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await db
    .from("events")
    .select("props, created_at")
    .eq("name", EVENT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];

  const seen = new Set<string>();
  const live: string[] = [];
  for (const row of data) {
    const p = (row.props ?? {}) as { token?: unknown; enabled?: unknown };
    const token = typeof p.token === "string" ? p.token : null;
    if (!token || seen.has(token)) continue; // first == newest state
    seen.add(token);
    if (p.enabled !== false) live.push(token);
  }
  return live;
}

export interface PushToUserResult {
  web: number;
  native: number;
}

export async function pushToUser(
  db: SupabaseClient,
  userId: string,
  msg: UserPush,
  siteBase: string,
): Promise<PushToUserResult> {
  const url = `${siteBase}${msg.path}`;
  let web = 0;
  let native = 0;

  try {
    // ── Browsers ──
    if (pushConfigured()) {
      const { data } = await db
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", userId);

      const expired: string[] = [];
      for (const s of (data ?? []) as PushSub[]) {
        const result = await sendPush(s, {
          title: msg.title,
          body: msg.body,
          url,
          tag: msg.tag,
        });
        if (result === "sent") web++;
        else if (result === "expired") expired.push(s.endpoint);
      }
      if (expired.length) {
        await db.from("push_subscriptions").delete().in("endpoint", expired);
      }
    }

    // ── The app ──
    const tokens = await expoTokensFor(db, userId);
    if (tokens.length) {
      const { sent, dead } = await sendExpoPush(
        tokens.map((to) => ({
          to,
          title: msg.title,
          body: msg.body,
          data: { url, path: msg.path },
        })),
      );
      native = sent;
      // Retire a dead token with a newer disabled event so it drops out next
      // time rather than being retried forever.
      for (const token of dead) {
        await db
          .from("events")
          .insert({ user_id: userId, name: EVENT, props: { token, enabled: false } });
      }
    }
  } catch (err) {
    console.error("pushToUser failed", err);
  }

  return { web, native };
}
