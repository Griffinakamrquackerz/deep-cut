import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "./email";
import { siteUrl } from "./site";

// Telling a filmmaker the outcome.
//
// The receipt they got when they submitted promises they'll hear back either
// way, and calls never hearing anything "the thing everyone hates about
// submitting". This is what makes that a promise rather than a sentiment.
//
// Two deliberate asymmetries between the two outcomes:
//
//   A PASS IS NEVER SENT AUTOMATICALLY. Marking a submission passed is one
//   click and easy to mis-click; a rejection email cannot be unsent. So the
//   status change and the email are separate actions, and the console counts
//   what's owed so the queue stays visible instead of relying on memory.
//
//   MAKING THE SLATE IS SENT IMMEDIATELY. It's unambiguously good news, there
//   is no version of it somebody regrets sending, and a director whose film is
//   on a public ballot should not find out by refreshing the page.

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

function shell(title: string, body: string): string {
  return `
    <div style="font-family:Georgia,serif;color:#f3e9d7;background:#171210;padding:32px">
      <p style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#b7a491;margin:0">
        Deep Cut · The Indie Film Fund
      </p>
      <h1 style="font-size:28px;color:#ffb454;margin:8px 0 16px">${escapeHtml(title)}</h1>
      ${body}
      <p style="line-height:1.6;margin:24px 0 0;color:#b7a491">— Deep Cut</p>
    </div>`;
}

/**
 * A pass.
 *
 * Written the way you'd want to receive one: says no in the first line rather
 * than burying it, gives the one thing a director can actually use (that it was
 * read, and that nothing is exclusive), and doesn't pretend the decision means
 * more than it does. No feedback offered, because feedback we haven't actually
 * written is worse than none.
 */
function passHtml(director: string, title: string): string {
  return shell(
    "Not this round",
    `<p style="line-height:1.6;margin:0 0 12px">${escapeHtml(director)} —</p>
     <p style="line-height:1.6;margin:0 0 12px">
       We read <strong>${escapeHtml(title)}</strong> and we're not taking it
       forward this round. That's a no, and I'd rather say it plainly than leave
       you refreshing an inbox.
     </p>
     <p style="line-height:1.6;margin:0 0 12px">
       It was read properly, by a person, and your previous work was watched.
       Nine films reach the ballot each round, so a pass is mostly a statement
       about a very short list rather than about your film.
     </p>
     <p style="line-height:1.6;margin:0 0 12px">
       Nothing was held and nothing was exclusive — take it anywhere, and if it
       gets made elsewhere we'll be genuinely pleased. You're welcome to submit
       something else, or the same film to a later round.
     </p>`,
  );
}

/** Made the slate. Sent the moment it happens. */
function showcasedHtml(director: string, title: string): string {
  return shell(
    "You're on the ballot",
    `<p style="line-height:1.6;margin:0 0 12px">${escapeHtml(director)} —</p>
     <p style="line-height:1.6;margin:0 0 12px">
       <strong>${escapeHtml(title)}</strong> is on the slate. Members are reading
       your pitch and your previous work now, and spending the votes they've
       earned on which film we finance.
     </p>
     <p style="line-height:1.6;margin:0 0 12px">
       <a href="${siteUrl()}/vote" style="color:#ffb454">See the ballot →</a>
     </p>
     <p style="line-height:1.6;margin:0 0 12px">
       One thing worth being straight about: being on the ballot is not a
       commission. The fund has to clear its goal before anything gets made, and
       then the vote decides which one. So this is real and it is not yet money.
     </p>
     <p style="line-height:1.6;margin:0 0 12px">
       If anything on your pitch needs correcting before more people read it,
       reply to this and we'll fix it.
     </p>`,
  );
}

export type ReplyKind = "passed" | "showcased";

export type ReplyResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "already_replied" | "not_decided" | "email_failed" | "failed"; note?: string };

/**
 * Send the outcome to one director and record that it went.
 *
 * The timestamp is written only AFTER the send succeeds. The other order would
 * mark somebody as told when the email bounced, and a filmmaker who was
 * silently never answered is exactly what this exists to prevent.
 */
export async function sendSubmissionReply(
  db: SupabaseClient,
  submissionId: string,
): Promise<ReplyResult> {
  const { data, error } = await db
    .from("film_submissions")
    .select("id, director, email, title, status, replied_at")
    .eq("id", submissionId)
    .maybeSingle();

  if (error) return { ok: false, reason: "failed", note: error.message };
  if (!data) return { ok: false, reason: "not_found" };

  const row = data as {
    director: string;
    email: string;
    title: string;
    status: string;
    replied_at: string | null;
  };

  if (row.replied_at) return { ok: false, reason: "already_replied" };
  if (row.status !== "passed" && row.status !== "showcased") {
    return { ok: false, reason: "not_decided" };
  }

  const kind = row.status as ReplyKind;
  const sent = await sendEmail({
    to: row.email,
    subject:
      kind === "showcased"
        ? `"${row.title}" is on the ballot`
        : `About "${row.title}"`,
    html:
      kind === "showcased"
        ? showcasedHtml(row.director, row.title)
        : passHtml(row.director, row.title),
  });

  if (!sent.ok) {
    return { ok: false, reason: "email_failed", note: sent.error ?? undefined };
  }

  const { error: markErr } = await db
    .from("film_submissions")
    .update({ replied_at: new Date().toISOString() })
    .eq("id", submissionId);

  if (markErr) {
    // They have been told; we just failed to write it down. Reporting failure
    // would invite a second send, so this succeeds loudly in the log instead.
    console.error(`reply sent to ${row.email} but replied_at not recorded`, markErr.message);
  }

  return { ok: true };
}

/** How many decided submissions nobody has been told about. */
export function countOwed(
  subs: Array<{ status: string; repliedAt: string | null }>,
): number {
  return subs.filter(
    (s) => (s.status === "passed" || s.status === "showcased") && !s.repliedAt,
  ).length;
}
