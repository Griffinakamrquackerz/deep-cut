// @handles in a comment — the client half of ../src/lib/mentions.ts.
//
// Resolving handles to ids is the server's job; the app only needs to know
// where the @tokens are: which one the caret is sitting in (so the picker knows
// when to open) and where they fall in a finished comment (so they can be
// drawn as links). Keep this in step with the web file — the two must agree on
// what counts as a handle, or a comment would tag different people depending on
// which one you typed it in.

/**
 * Written as a leading capture group rather than a lookbehind on purpose:
 * Hermes, which is what the app actually runs on, does not support lookbehind.
 */
const HANDLE = /(^|[^a-zA-Z0-9_.])@([a-zA-Z0-9_.]{2,30})/g;

export interface MentionSpan {
  /** "text" runs through verbatim; "mention" is a handle worth linking. */
  kind: "text" | "mention";
  value: string;
}

/**
 * Split a body into plain runs and @handles, for rendering.
 *
 * Takes the set of handles known to exist so an unmatched "@thing" renders as
 * ordinary text rather than a link to nothing.
 */
export function splitMentions(body: string, known: Set<string>): MentionSpan[] {
  const out: MentionSpan[] = [];
  let at = 0;
  for (const m of body.matchAll(HANDLE)) {
    const handle = m[2].toLowerCase().replace(/\.+$/, "");
    if (!known.has(handle)) continue;
    // m.index points at the character before the @, when there is one.
    const start = (m.index ?? 0) + m[1].length;
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
 * Reads only the token immediately left of the caret, so an @ earlier in the
 * line that has already been finished doesn't reopen the picker, and moving the
 * caret away closes it.
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
