import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Who gets the post, and how somebody gets off the list.
//
// The unsubscribe link in an email has to work without signing in. Someone who
// has lost interest in an app will not create a session to escape its mail;
// they will mark it spam, which costs the sending domain far more than the
// unsubscribe would have. So the link carries its own proof: the user id, the
// kind of mail, and an HMAC of both. No session, no database lookup to
// validate, and nothing that lets a stranger unsubscribe somebody else — the
// signature is only forgeable by whoever holds the secret.

export type EmailKind = "programme";

/**
 * Signing secret. Falls back to the service-role key, which every deployment
 * already has and never ships to a browser, so unsubscribe links work without
 * one more environment variable to forget.
 */
function secret(): string {
  return (
    process.env.EMAIL_LINK_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "deep-cut-unsigned"
  );
}

export function unsubscribeToken(userId: string, kind: EmailKind): string {
  return createHmac("sha256", secret()).update(`${userId}:${kind}`).digest("hex").slice(0, 32);
}

export function unsubscribeUrl(base: string, userId: string, kind: EmailKind): string {
  const t = unsubscribeToken(userId, kind);
  return `${base}/unsubscribe?u=${encodeURIComponent(userId)}&k=${kind}&t=${t}`;
}

/** Constant-time, so a wrong token can't be narrowed down a character at a time. */
export function validUnsubscribe(userId: string, kind: EmailKind, token: string): boolean {
  const expected = unsubscribeToken(userId, kind);
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function optOut(
  db: SupabaseClient,
  userId: string,
  kind: EmailKind,
): Promise<boolean> {
  const { error } = await db
    .from("email_optouts")
    .upsert({ user_id: userId, kind }, { onConflict: "user_id,kind" });
  if (error) {
    console.error("optOut failed", error.message);
    return false;
  }
  return true;
}

export async function optIn(db: SupabaseClient, userId: string, kind: EmailKind): Promise<void> {
  await db.from("email_optouts").delete().eq("user_id", userId).eq("kind", kind);
}

export async function isOptedOut(
  db: SupabaseClient,
  userId: string,
  kind: EmailKind,
): Promise<boolean> {
  const { data } = await db
    .from("email_optouts")
    .select("user_id")
    .eq("user_id", userId)
    .eq("kind", kind)
    .maybeSingle();
  return !!data;
}

/**
 * The ids that have opted out of a kind.
 *
 * A failure here returns an empty set, which would mean mailing everybody —
 * so callers must treat a throw as "don't send at all" rather than "send to
 * all". optedOutIdsStrict does that for them.
 */
export async function optedOutIdsStrict(
  db: SupabaseClient,
  kind: EmailKind,
): Promise<Set<string>> {
  const { data, error } = await db.from("email_optouts").select("user_id").eq("kind", kind);
  if (error) throw new Error(`email_optouts unreadable: ${error.message}`);
  return new Set((data ?? []).map((r) => String(r.user_id)));
}
