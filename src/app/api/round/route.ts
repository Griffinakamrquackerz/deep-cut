import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentRound, pitchesFor, tallies, myBallot, shuffleForViewer } from "@/lib/voting";
import { fundProgress, myStanding } from "@/lib/fund";

// The current greenlight round: the pitches, where the vote stands, and — if
// you're signed in — your budget and what you've already spent.
//
// Public, because the ballot is the pitch for joining. Somebody who hasn't
// given a cent should be able to read every pitch and see the running totals;
// what they can't do is vote.

export const dynamic = "force-dynamic";

export async function GET() {
  const db = supabaseAdmin();

  const round = await currentRound(db).catch(() => null);
  if (!round) {
    // No round yet. Say so plainly — the fund bar is the thing to show instead.
    const fund = await fundProgress(db).catch(() => null);
    return NextResponse.json({ round: null, fund });
  }

  const [pitches, fund] = await Promise.all([
    pitchesFor(db, round.id).catch(() => []),
    fundProgress(db).catch(() => null),
  ]);

  const user = await currentUser();
  const [tally, mine, me] = await Promise.all([
    tallies(db, round.id).catch(() => []),
    user ? myBallot(db, user.id, round.id).catch(() => ({})) : Promise.resolve({}),
    user ? myStanding(db, user.id).catch(() => null) : Promise.resolve(null),
  ]);

  const spent = Object.values(mine).reduce((s, n) => s + n, 0);

  return NextResponse.json({
    round,
    fund,
    // Order differs per viewer so ballot position doesn't decide the outcome,
    // and is stable per viewer so the page doesn't reshuffle mid-decision.
    pitches: shuffleForViewer(pitches, user?.id ?? "anon"),
    tallies: tally,
    me: user
      ? { budget: me?.points ?? 0, spent, remaining: Math.max(0, (me?.points ?? 0) - spent), ballot: mine }
      : null,
  });
}
