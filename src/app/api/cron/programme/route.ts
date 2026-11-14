import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";
import {
  emailConfigured,
  sendEmailBatch,
  programmeHtml,
  type BatchEmail,
  type ProgrammeFilm,
} from "@/lib/email";
import { optedOutIdsStrict, unsubscribeUrl } from "@/lib/email-prefs";
import { CHANNELS, featureOfWeek } from "@/lib/shorts";
import { programmeShowing } from "@/lib/shorts-admin";
import { siteUrl } from "@/lib/site";

// The monthly programme — the new bill, posted the way a repertory house posts
// one. Wired to a Vercel Cron on the 1st (see vercel.json).
//
// This is the first mail Deep Cut sends that nobody asked for, and it's the
// one that reaches people push can't: push only goes to the fraction who
// clicked Allow, while everybody who signed up has an email address. That is
// exactly why it also has to be easy to leave, and why a failure to read the
// opt-out list stops the run rather than mailing everyone.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const channelName = (key: string) =>
  CHANNELS.find((c) => c.key === key)?.label ?? "The Theatre";

export async function GET(req: Request) {
  // ?preview=1 sends the real thing to the admin alone, from a browser.
  // A first mass send with no way to see it first is how you find out the
  // template is broken in front of the whole list.
  const preview = new URL(req.url).searchParams.get("preview") === "1";
  const admin = preview ? await requireAdmin() : null;

  if (!admin) {
    // Fail CLOSED, and for this route more than the other two: it mails
    // everybody who ever signed up, not just the fraction who allowed push.
    // It used to skip the check entirely when CRON_SECRET was unset — while
    // /api/version published `cronSecret: false` to anyone who asked, making
    // "is this open?" one unauthenticated request. The preview guard below
    // was a partial version of this: it refused an unauthenticated PREVIEW
    // but happily ran the real send.
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  if (!emailConfigured()) {
    return NextResponse.json({ ok: false, reason: "no_resend_key", sent: 0 });
  }

  const films = await programmeShowing().catch(() => []);
  // No bill, no programme. An email announcing nothing is worse than silence
  // and spends a send on every subscriber to say it.
  if (!films.length) return NextResponse.json({ ok: true, reason: "empty_bill", sent: 0 });

  const db = supabaseAdmin();

  // If this list can't be read, stop. The failure mode of guessing is mailing
  // people who explicitly asked not to be mailed, which is the one mistake
  // there's no taking back.
  let optedOut: Set<string>;
  try {
    optedOut = await optedOutIdsStrict(db, "programme");
  } catch (err) {
    console.error("programme cron: opt-out list unreadable, refusing to send", err);
    return NextResponse.json({ ok: false, reason: "optouts_unreadable", sent: 0 }, { status: 500 });
  }

  // A preview is a list of one. Everything below is the same code path the
  // real run takes, so what lands in the inbox is what everyone would get.
  const { data: allUsers } = admin
    ? await db.from("users").select("id, email").eq("id", admin.id)
    : await db.from("users").select("id, email").not("email", "is", null);
  const users = allUsers;

  const toFilm = (f: (typeof films)[number]): ProgrammeFilm => ({
    title: f.title,
    director: f.director,
    year: f.year,
    runtimeSec: f.runtimeSec,
    pedigree: f.pedigree,
    channelName: channelName(f.channels[0] ?? ""),
  });

  const base = siteUrl();
  const month = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const feature = featureOfWeek(films);
  const bill = films.map(toFilm);

  const subject = `The new bill — ${bill.length} shorts you haven't seen`;
  const recipients = ((users ?? []) as Array<{ id: string; email: string }>).filter(
    (u) => u.email && !optedOut.has(u.id),
  );
  const skipped = (users?.length ?? 0) - recipients.length;

  const queue: BatchEmail[] = recipients.map((u) => ({
    to: u.email,
    subject,
    html: programmeHtml({
      films: bill,
      feature: feature ? toFilm(feature) : null,
      month,
      watchUrl: `${base}/tv?utm=programme`,
      // Per person: a shared link would let anyone unsubscribe anyone.
      unsubscribeUrl: unsubscribeUrl(base, u.id, "programme"),
    }),
  }));

  // 100 per request is Resend's batch ceiling. Stop with time to spare and say
  // how many are left rather than being killed mid-send — a run that dies
  // silently at the same point every month mails the same people forever and
  // never reaches anyone past them.
  const startedAt = Date.now();
  const BUDGET_MS = (maxDuration - 30) * 1000;

  let sent = 0;
  let failed = 0;
  let unsent = 0;
  let lastError: string | undefined;

  for (let i = 0; i < queue.length; i += 100) {
    if (Date.now() - startedAt > BUDGET_MS) {
      unsent = queue.length - i;
      console.error(`programme cron ran out of time with ${unsent} emails unsent`);
      break;
    }
    const r = await sendEmailBatch(queue.slice(i, i + 100));
    sent += r.sent;
    failed += r.failed;
    if (r.error) lastError = r.error;
  }

  return NextResponse.json({
    ok: unsent === 0,
    preview: !!admin,
    films: bill.length,
    sent,
    failed,
    skipped,
    // Non-zero means the list has outgrown one run — page it or raise the cap.
    unsent,
    error: lastError,
  });
}
