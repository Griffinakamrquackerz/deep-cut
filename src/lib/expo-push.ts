import type { SupabaseClient } from "@supabase/supabase-js";

// Expo push — the native counterpart to web-push. Tokens are stored as
// "expo_push_token" events; here we resolve the current set (newest state per
// token wins) and fan messages out through Expo's push service. No SDK, no
// keys: Expo's endpoint takes the token directly.
const EVENT = "expo_push_token";
const EXPO_ENDPOINT = "https://exp.host/--/api/v2/push/send";

export interface ExpoPushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** token → user_id for every device currently opted in (enabled, deduped). */
export async function activeExpoTokens(
  db: SupabaseClient,
): Promise<Array<{ token: string; userId: string }>> {
  const { data, error } = await db
    .from("events")
    .select("user_id, props, created_at")
    .eq("name", EVENT)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error || !data) return [];

  const seen = new Set<string>();
  const out: Array<{ token: string; userId: string }> = [];
  for (const row of data) {
    const p = (row.props ?? {}) as { token?: unknown; enabled?: unknown };
    const token = typeof p.token === "string" ? p.token : null;
    if (!token || seen.has(token)) continue; // first == newest state
    seen.add(token);
    if (p.enabled !== false) out.push({ token, userId: row.user_id as string });
  }
  return out;
}

/** Send one message per token via Expo (batched by 100). Returns tokens Expo
 *  reported as dead (DeviceNotRegistered) so the caller can prune them. */
export async function sendExpoPush(
  messages: Array<{ to: string } & ExpoPushMessage>,
): Promise<{ sent: number; dead: string[] }> {
  let sent = 0;
  const dead: string[] = [];

  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(batch),
      });
      const json = (await res.json().catch(() => null)) as
        | { data?: Array<{ status?: string; details?: { error?: string } }> }
        | null;
      const tickets = json?.data ?? [];
      tickets.forEach((t, idx) => {
        if (t.status === "ok") sent++;
        else if (t.details?.error === "DeviceNotRegistered") dead.push(batch[idx].to);
      });
    } catch {
      /* a failed batch just doesn't send — try again next cron */
    }
  }
  return { sent, dead };
}
