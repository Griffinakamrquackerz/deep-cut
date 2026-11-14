import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { currentCycle } from "@/lib/fund";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { submitPitch } from "@/lib/submissions";
import { SUBMISSION_TERMS_VERSION } from "@/lib/submission-terms";
import { MAX_ATTACHMENTS, isAllowed, displayName } from "@/lib/attachments";
import { sendEmail } from "@/lib/email";
import { adminEmails } from "@/lib/admin";
import { siteUrl } from "@/lib/site";

// Filmmakers, submitting.
//
// Public and account-free on purpose. The Fund page has said "no agent, no
// connections, no pay-to-play submission fee" since it shipped, and requiring
// a membership before a director can hand in a script would quietly make that
// untrue. If they happen to be signed in the submission gets tied to their
// account; if not it's tied to their email.

export const dynamic = "force-dynamic";

const link = z
  .string()
  .trim()
  .max(600)
  .refine((s) => s === "" || /^https?:\/\//i.test(s), "must be a link")
  .transform((s) => (s === "" ? null : s))
  .optional();

const Input = z.object({
  director: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  title: z.string().trim().min(1).max(200),
  logline: z.string().trim().min(1).max(300),
  synopsis: z.string().trim().min(1).max(6000),
  genre: z.string().trim().max(80).optional(),
  comps: z.string().trim().max(200).optional(),
  /** Whole dollars from the form; stored as cents. */
  budget: z.number().int().min(0).max(100_000_000).optional(),
  deckUrl: link,
  priorWorkUrl: link,
  oneSheetUrl: link,
  /**
   * The submission terms, accepted.
   *
   * A literal `true` rather than a boolean: a client that forgets to send it,
   * or sends false, is rejected rather than quietly filed as consenting. The
   * release is the entire point of collecting it, and a release nobody agreed
   * to is worse than none because it looks like one.
   */
  agreedToTerms: z.literal(true),
  /**
   * Files already in the private bucket, put there on a signed URL minted by
   * /api/submit/upload-url. Re-checked here rather than trusted: the client
   * names the path it uploaded to, and a path is the one field a browser could
   * lie about. Type and size are validated again for the same reason.
   */
  attachments: z
    .array(
      z.object({
        path: z.string().trim().min(1).max(400),
        name: z.string().trim().min(1).max(200),
        size: z.number().int().positive(),
        type: z.string().trim().max(200),
      }),
    )
    .max(MAX_ATTACHMENTS)
    .optional(),
  /** Honeypot — humans never see the field, bots can't leave it alone. */
  hp: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues }, { status: 400 });
  }
  const p = parsed.data;

  // Silently accept and discard. A bot told it failed simply tries again.
  if (p.hp && p.hp.trim() !== "") return NextResponse.json({ ok: true, received: true });

  const user = await currentUser().catch(() => null);

  const res = await submitPitch(supabaseAdmin(), {
    director: p.director,
    email: p.email,
    title: p.title,
    logline: p.logline,
    synopsis: p.synopsis,
    genre: p.genre,
    comps: p.comps,
    budgetCents: p.budget != null ? p.budget * 100 : null,
    deckUrl: p.deckUrl ?? null,
    priorWorkUrl: p.priorWorkUrl ?? null,
    oneSheetUrl: p.oneSheetUrl ?? null,
    userId: user?.id ?? null,
    // Recorded server-side from the constant, never from the request body — a
    // client that could name its own version could claim agreement to wording
    // that was never on the screen.
    termsVersion: SUBMISSION_TERMS_VERSION,
    // Anything that fails the type/size check is dropped rather than rejecting
    // the whole pitch — the text is the submission, the files are the extras,
    // and losing a week of work over one bad upload is the wrong trade. The
    // path is confined to this cycle's prefix so a crafted one can't attach
    // somebody else's script to your pitch.
    attachments: (p.attachments ?? [])
      .filter((a) => isAllowed(a.type, a.size))
      .filter((a) => a.path.startsWith(`${currentCycle()}/`) && !a.path.includes(".."))
      .map((a) => ({ ...a, name: displayName(a.name) })),
  });

  if (!res.ok) {
    // The likeliest cause by a mile is migration 0019 not having been run.
    return NextResponse.json(
      { error: "submission_failed", note: "Run supabase/migrations/0019_submissions.sql." },
      { status: 500 },
    );
  }

  // Tell the director it landed. Their pitch going into a void is the single
  // most common complaint about every submissions process in this industry,
  // and an email costs nothing.
  await sendEmail({
    to: p.email,
    subject: `We've got "${p.title}"`,
    html: receiptHtml(p.director, p.title),
  }).catch(() => null);

  // And tell the house. A submissions pile nobody knows has grown is a pile
  // nobody reads.
  const to = adminEmails()[0];
  if (to) {
    await sendEmail({
      to,
      subject: `New pitch: ${p.title} — ${p.director}`,
      html: `<p><strong>${escapeHtml(p.title)}</strong> — dir. ${escapeHtml(p.director)}</p>
             <p>${escapeHtml(p.logline)}</p>
             <p><a href="${siteUrl()}/admin">Open the pile →</a></p>`,
    }).catch(() => null);
  }

  return NextResponse.json({ ok: true, updated: res.updated });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

function receiptHtml(director: string, title: string): string {
  return `
    <div style="font-family:Georgia,serif;color:#f3e9d7;background:#171210;padding:32px">
      <p style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#b7a491;margin:0">
        Deep Cut · The Indie Film Fund
      </p>
      <h1 style="font-size:28px;color:#ffb454;margin:8px 0 16px">It's in the pile.</h1>
      <p style="line-height:1.6;margin:0 0 12px">${escapeHtml(director)} —</p>
      <p style="line-height:1.6;margin:0 0 12px">
        We've got <strong>${escapeHtml(title)}</strong>. Somebody here will read the
        whole thing and watch your previous work. That takes a while and we'd
        rather be slow than skim it.
      </p>
      <p style="line-height:1.6;margin:0 0 12px">
        You'll hear from us either way — a pass is still an answer, and not
        hearing back is the thing everyone hates about submitting.
      </p>
      <p style="line-height:1.6;margin:0 0 12px">
        If it makes the slate it goes in front of our members, who vote on which
        film we finance. No fee, at any point.
      </p>
      <p style="line-height:1.6;margin:24px 0 0;color:#b7a491">— Deep Cut</p>
    </div>`;
}
