import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { pushConfigured } from "@/lib/push";
import { siteUrl } from "@/lib/site";
import { currentRound, pitchesFor } from "@/lib/voting";
import { campaignFor } from "@/lib/campaign";
import { alreadySent, broadcast, markSent, reach } from "@/lib/broadcast";

// Put the current open call on everybody's lock screen.
//
// GET  → what WOULD happen: the message, the recipient count, and whether
//        this announcement has already gone out.
// POST → sends it, and only with confirm:true in the body.
//
// The message is not a parameter. It's derived from the round's status by the
// same campaignFor() the in-app banner uses, which means the push, the site
// and the app cannot disagree, and it's impossible to announce a ballot that
// isn't open. Free text would be more flexible and would also let somebody
// broadcast a typo to every phone in the building at two in the morning.

export const dynamic = "force-dynamic";
// Fans out to every subscriber, so it needs the same ceiling as the Friday
// cron. Vercel's default would kill the run partway down the list, leaving
// half the house notified and the other half not — and the marker recorded
// either way.
export const maxDuration = 300;

async function plan() {
  const db = supabaseAdmin();
  const round = await currentRound(db).catch(() => null);
  const pitches = round ? await pitchesFor(db, round.id).catch(() => []) : [];
  const campaign = campaignFor(round?.status, pitches.length);
  // Round id in the key, so the same campaign can be announced once per round
  // — the open call for the second film is a different announcement from the
  // open call for the first.
  const key = campaign && round ? `${campaign.key}:${round.id}` : null;
  return { db, round, pitches, campaign, key };
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { db, round, campaign, key } = await plan();
  const [who, sentAt] = await Promise.all([
    reach(db),
    key ? alreadySent(db, key) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    round: round ? { id: round.id, title: round.title, status: round.status } : null,
    // null means there is nothing to announce — no round, the round is
    // finished, or it's set to voting with an empty ballot. The button should
    // be disabled rather than sending a push to a page with nothing on it.
    campaign: campaign
      ? { key: campaign.key, title: campaign.pushTitle, body: campaign.pushBody, path: campaign.path }
      : null,
    reach: who,
    alreadySentAt: sentAt,
    // Without VAPID keys the web half sends nothing at all, silently. Worth
    // saying up front rather than reporting "0 sent" afterwards.
    webPushConfigured: pushConfigured(),
  });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    confirm?: boolean;
    /** Deliberately send an announcement that has already gone out. */
    force?: boolean;
  };

  const { db, campaign, key } = await plan();
  if (!campaign || !key) {
    return NextResponse.json(
      {
        error: "nothing_to_announce",
        note: "No round is asking for anything right now. Check the round's status — a round set to voting with no pitches on the ballot counts as nothing to announce.",
      },
      { status: 409 },
    );
  }

  // Refuse by default rather than treating a bare POST as consent. A
  // broadcast can't be recalled.
  if (!body.confirm) {
    const who = await reach(db);
    return NextResponse.json(
      {
        error: "not_confirmed",
        note: "Send confirm:true to actually notify people.",
        would: { title: campaign.pushTitle, body: campaign.pushBody, path: campaign.path },
        reach: who,
      },
      { status: 400 },
    );
  }

  const sentAt = await alreadySent(db, key);
  if (sentAt && !body.force) {
    return NextResponse.json(
      {
        error: "already_sent",
        sentAt,
        note: "This announcement has already gone out for this round. Send force:true only if you mean to notify everybody a second time.",
      },
      { status: 409 },
    );
  }

  const result = await broadcast(
    db,
    {
      title: campaign.pushTitle,
      body: campaign.pushBody,
      path: campaign.path,
      // Round in the tag as well as the key: two announcements must not
      // collapse into one on a lock screen.
      tag: `announce-${key}`,
    },
    siteUrl(),
  );

  await markSent(db, key, admin.id, result);

  return NextResponse.json({ ok: true, sent: result, resent: !!sentAt });
}
