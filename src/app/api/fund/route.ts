import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fundProgress, myStanding, sharePct } from "@/lib/fund";

// The Fund, from the outside.
//
// Public on purpose: the bar is the pitch. Somebody who hasn't signed up
// should be able to see how close the next film is without making an account,
// and a number nobody can check is just a claim.
//
// Totals only — never who gave what. How much somebody supports a thing is
// their business, and a public per-person ledger would also turn the point cap
// into a leaderboard, which is the opposite of what it's for.

export const dynamic = "force-dynamic";

export async function GET() {
  const db = supabaseAdmin();

  // Pre-migration-0016 this table doesn't exist. An empty bar is honest — the
  // fund genuinely has nothing in it — and beats a broken landing page.
  const progress = await fundProgress(db).catch(() => null);
  if (!progress) {
    return NextResponse.json({ ready: false, sharePct: sharePct() });
  }

  const user = await currentUser();
  const mine = user ? await myStanding(db, user.id).catch(() => null) : null;

  return NextResponse.json({
    ready: true,
    sharePct: sharePct(),
    ...progress,
    mine,
  });
}
