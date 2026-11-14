import type { SupabaseClient } from "@supabase/supabase-js";

// @handles in a comment.
//
// The text is stored exactly as typed — no markup, no ids baked into the body.
// Handles can change, and a comment that hard-codes "@griff" as a link to a
// user id would either rot or lie the moment somebody renames themselves. So
// the body stays plain, the resolved ids ride alongside it for notifying, and
// rendering re-matches at read time against whoever holds that handle now.

/**
 * Same shape a handle is allowed to be: letters, digits, underscore, dot —
 * and the @ has to start a word. Without that guard the tail of an email
 * address parses as a mention, so writing "mail me at griffin@hostfluencer.com"
 * in a comment would tag a user called hostfluencer.com if one ever existed.
 *
 * Written as a leading capture group rather than a lookbehind on purpose:
 * Hermes, which is what the app actually runs on, does not support lookbehind.
 */
const HANDLE = /(^|[^a-zA-Z0-9_.])@([a-zA-Z0-9_.]{2,30})/g;

/** Every @handle in the text, lowercased and de-duplicated, in order. */
export function parseHandles(body: string): string[] {
  const found: string[] = [];
  for (const m of body.matchAll(HANDLE)) {
    const h = m[2].toLowerCase().replace(/\.+$/, ""); // a trailing dot is punctuation
    if (h.length >= 2 && !found.includes(h)) found.push(h);
  }
  return found;
}

/**
 * Turn the @handles in a body into user ids.
 *
 * Only handles that actually exist come back — typing "@nobody" is just text,
 * and must not become a dangling mention. Capped so a comment stuffed with a
 * hundred handles can't fan out into a hundred inserts.
 */
export async function resolveMentions(
  db: SupabaseClient,
  body: string,
  limit = 10,
): Promise<{ id: string; handle: string }[]> {
  const handles = parseHandles(body).slice(0, limit);
  if (!handles.length) return [];

  const { data } = await db.from("users").select("id, handle").in("handle", handles);
  return ((data ?? []) as Record<string, unknown>[])
    .filter((u) => u.id && u.handle)
    .map((u) => ({ id: String(u.id), handle: String(u.handle) }));
}

export interface MentionSpan {
  /** "text" runs through verbatim; "mention" is a handle worth linking. */
  kind: "text" | "mention";
  value: string;
}

/**
 * Split a body into plain runs and @handles, for rendering.
 *
 * Takes the set of handles known to exist so an unmatched "@thing" renders as
 * ordinary text rather than a link to nothing. Case is preserved from the
 * original text; matching is case-insensitive.
 */
export function splitMentions(body: string, known: Set<string>): MentionSpan[] {
  const out: MentionSpan[] = [];
  let at = 0;
  for (const m of body.matchAll(HANDLE)) {
    const handle = m[2].toLowerCase().replace(/\.+$/, "");
    if (!known.has(handle)) continue;
    // m.index points at the character before the @, when there is one.
    const start = (m.index ?? 0) + m[1].length;
    // The trailing dot we trimmed belongs to the sentence, not the handle.
    const end = start + 1 + handle.length;
    if (start > at) out.push({ kind: "text", value: body.slice(at, start) });
    out.push({ kind: "mention", value: handle });
    at = end;
  }
  if (at < body.length) out.push({ kind: "text", value: body.slice(at) });
  return out;
}

/**
 * The @token being typed at the caret, or null if the caret isn't in one.
 *
 * This is what decides whether the picker is open, and on which @: it reads
 * only the token immediately left of the caret, so an @ earlier in the line
 * that has already been finished doesn't reopen it, and moving the caret away
 * closes it.
 */
export function tokenAtCaret(
  value: string,
  caret: number,
): { at: number; query: string } | null {
  const upto = value.slice(0, caret);
  const at = upto.lastIndexOf("@");
  if (at < 0) return null;
  // Must start a word, or it's an email's @ rather than a mention's.
  if (at > 0 && /[a-zA-Z0-9_.]/.test(upto[at - 1])) return null;
  const query = upto.slice(at + 1);
  // A space (or any non-handle character) closes the token.
  if (/[^a-zA-Z0-9_.]/.test(query)) return null;
  if (query.length > 30) return null;
  return { at, query };
}
