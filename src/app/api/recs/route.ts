import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { dealRecs } from "@/lib/engine";
import { checkAndIncrement, refund, DAILY_LIMITS, FREE_REC_BATCHES } from "@/lib/rate-limit";
import { isPremium } from "@/lib/premium";
import { RecBatchInput } from "@/lib/schemas";

// 60s is the safe ceiling on Vercel's free (Hobby) plan.
export const maxDuration = 60;

/** Active recs with joined movie data. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = supabaseAdmin();
  const query = (cols: string) =>
    db
      .from("recommendations")
      .select(`id, reason, obscurity, status, batch, created_at, movies(${cols})`)
      .eq("user_id", user.id)
      .in("status", ["active", "watchlisted"])
      .order("created_at", { ascending: false })
      .limit(60);

  let { data, error } = await query(
    "id, title, year, runtime, poster_path, overview, genres, providers, tmdb_rating, imdb_rating, rt_rating",
  );
  if (error) {
    // Ratings columns may not exist yet (migration 0003 unapplied) — the recs
    // themselves must still load.
    ({ data, error } = await query(
      "id, title, year, runtime, poster_path, overview, genres, providers",
    ));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ recs: data ?? [] });
}

/** Deal a new validated batch. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const parsed = RecBatchInput.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  if (parsed.data.obscurityMin > parsed.data.obscurityMax) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }

  // General Admission gets FREE_REC_BATCHES/day; Balcony Seats gets the full house.
  const premium = await isPremium(user.id);
  const limit = premium ? DAILY_LIMITS.rec_batch : FREE_REC_BATCHES;
  const allowed = await checkAndIncrement(user.id, "rec_batch", limit);
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited", limit: `${limit} deals/day`, premium },
      { status: 429 },
    );
  }

  try {
    const recs = await dealRecs(user.id, parsed.data);
    if (recs.length === 0) await refund(user.id, "rec_batch"); // empty deal = free
    return NextResponse.json({ dealt: recs.length, recs });
  } catch (err) {
    await refund(user.id, "rec_batch"); // errors shouldn't burn quota
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
