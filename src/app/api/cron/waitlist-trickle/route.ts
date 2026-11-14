import { NextResponse } from "next/server";
import { approveNext } from "@/lib/waitlist";

// The daily trickle — lets the next N people off the waitlist every day
// (Vercel Cron, see vercel.json). N defaults to 25: enough to feel alive,
// comfortably under Resend's ~100-emails/day free tier, and pausable by
// setting WAITLIST_DAILY=0. Same bearer-secret auth as the Friday deal cron.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  // Fail CLOSED. This used to be `if (secret) { ...check... }`, so a
  // deployment with no CRON_SECRET set skipped the check entirely — and
  // /api/version published `cronSecret: false` to anybody who asked, which
  // turned "is this open?" into a single unauthenticated request. Anyone could
  // then drive this route directly: push-notify every subscriber in a loop,
  // mail the whole list, or burn the day's invite allowance.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const n = Number(process.env.WAITLIST_DAILY ?? 25);
  if (!Number.isFinite(n) || n <= 0) {
    return NextResponse.json({ ok: true, skipped: "trickle_paused", approved: [] });
  }

  try {
    const res = await approveNext(Math.min(n, 50));
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    console.error("waitlist trickle failed", err);
    return NextResponse.json({ ok: false, error: "trickle_failed" }, { status: 500 });
  }
}
