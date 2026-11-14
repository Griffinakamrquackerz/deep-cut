import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentCycle } from "@/lib/fund";
import { currentRound, pitchesFor, tallies } from "@/lib/voting";

// Opening and running a greenlight round.
//
// This existed only as SQL, which meant the one action the whole Fund page
// builds toward — putting a slate in front of members — was a hand-written
// insert into a production database. That is fine exactly once and a mistake
// waiting to happen every time after.
//
// The round id is always the fund's current cycle. Tying them together is what
// makes "votes count toward the NEXT film" true: bump FUND_CYCLE and both the
// ledger and the ballot move to the new picture in one step.

export const dynamic = "force-dynamic";

/** Everything the admin screen needs to run the round, in one call. */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const db = supabaseAdmin();
  const cycle = currentCycle();

  let round;
  try {
    round = await currentRound(db);
  } catch (e) {
    // Almost always migration 0017 not having been run. Name it, rather than
    // leaving a blank screen and a shrug.
    return NextResponse.json(
      {
        error: "rounds_table_missing",
        note: "Run supabase/migrations/0017_voting.sql.",
        detail: String(e).slice(0, 200),
      },
      { status: 500 },
    );
  }

  if (!round) return NextResponse.json({ cycle, round: null, pitches: [], tallies: [] });

  const [pitches, tally] = await Promise.all([
    pitchesFor(db, round.id).catch(() => []),
    tallies(db, round.id).catch(() => []),
  ]);

  return NextResponse.json({ cycle, round, pitches, tallies: tally });
}

const RoundInput = z.object({
  title: z.string().trim().min(1).max(200),
  status: z.enum(["collecting", "voting", "greenlit", "closed"]),
  closesAt: z.string().trim().max(40).nullable().optional(),
  /** Set when calling the round — must be a pitch in this round. */
  winnerPitchId: z.string().uuid().nullable().optional(),
});

/** Create the round for the current cycle, or update the one that exists. */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = RoundInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues }, { status: 400 });
  }
  const { title, status, closesAt, winnerPitchId } = parsed.data;

  const db = supabaseAdmin();
  const cycle = currentCycle();

  // Naming a winner that isn't on this round's slate would be silent and
  // permanent: the ballot would render no star and nothing would explain why.
  if (winnerPitchId) {
    const slate = await pitchesFor(db, cycle).catch(() => []);
    if (!slate.some((p) => p.id === winnerPitchId)) {
      return NextResponse.json({ error: "winner_not_in_round" }, { status: 400 });
    }
  }

  // opens_at is stamped ONCE, the first time the round goes into voting, and
  // never touched again. Recomputing it on every write would reset the opening
  // date every time somebody fixed a typo in the title, and null it the moment
  // the round was greenlit — losing the only record of when voting started.
  const existing = await currentRound(db).catch(() => null);
  const opensAt =
    existing?.opensAt ?? (status === "voting" ? new Date().toISOString() : null);

  const { error } = await db.from("film_rounds").upsert(
    {
      id: cycle,
      title,
      status,
      opens_at: opensAt,
      closes_at: closesAt || null,
      winner_pitch_id: winnerPitchId ?? null,
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error("round upsert failed", error.message);
    return NextResponse.json({ error: "write_failed", note: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, cycle });
}
