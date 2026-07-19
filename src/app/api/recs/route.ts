import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { dealRecs } from "@/lib/engine";
import { checkAndIncrement, refund, DAILY_LIMITS, FREE_REC_BATCHES } from "@/lib/rate-limit";
import { isPremium } from "@/lib/premium";
import { RecBatchInput } from "@/lib/schemas";
import { effectiveObscurity } from "@/lib/obscurity";

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
    "id, title, year, runtime, poster_path, overview, genres, providers, vote_count, popularity, tmdb_rating, imdb_rating, rt_rating",
  );
  if (error) {
    // Ratings columns may not exist yet (migration 0003 unapplied) — the recs
    // themselves must still load.
    ({ data, error } = await query(
      "id, title, year, runtime, poster_path, overview, genres, providers, vote_count, popularity",
    ));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Self-healing obscurity: stored scores predate the fame-cap fix, so re-score
  // from live movie data at read time — a stale "rare find" corrects itself.
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const recs = rows.map((r) => {
    const m = r.movies as unknown as {
      vote_count?: number;
      popularity?: number | null;
      year?: number | null;
    } | null;
    return m && typeof m.vote_count === "number"
      ? { ...r, obscurity: effectiveObscurity({ vote_count: m.vote_count, popularity: m.popularity, year: m.year }) }
      : r;
  });
  return NextResponse.json({ recs });
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
