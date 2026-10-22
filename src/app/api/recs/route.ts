import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { dealRecs } from "@/lib/engine";
import { regionFromRequest } from "@/lib/region";
import { checkAndIncrement, refund, DAILY_LIMITS, FREE_REC_BATCHES } from "@/lib/rate-limit";
import { isPremium } from "@/lib/premium";
import { RecBatchInput } from "@/lib/schemas";
import { effectiveObscurity } from "@/lib/obscurity";
import { gemScore } from "@/lib/gem";
import { isAdminEmail } from "@/lib/admin";

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
    "id, title, year, runtime, poster_path, overview, genres, providers, vote_count, popularity, tmdb_rating, imdb_rating, rt_rating, imdb_votes",
  );
  if (error) {
    // imdb_votes may not exist yet (migration 0007 unapplied) — drop just that.
    ({ data, error } = await query(
      "id, title, year, runtime, poster_path, overview, genres, providers, vote_count, popularity, tmdb_rating, imdb_rating, rt_rating",
    ));
  }
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
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const recs = rows.map((r) => {
    const m = r.movies as unknown as {
      vote_count?: number;
      popularity?: number | null;
      year?: number | null;
      imdb_votes?: number | null;
      imdb_rating?: number | null;
      rt_rating?: number | null;
      tmdb_rating?: number | null;
    } | null;
    return m && typeof m.vote_count === "number"
      ? {
          ...r,
          obscurity: effectiveObscurity({
            vote_count: m.vote_count,
            popularity: m.popularity,
            year: m.year,
            imdb_votes: m.imdb_votes,
          }),
          // Reach alone can't tell a hidden gem from a film nobody watched
          // because it isn't good, so the badge is driven by this instead.
          gem: gemScore({
            vote_count: m.vote_count,
            imdb_votes: m.imdb_votes,
            imdb_rating: m.imdb_rating,
            rt_rating: m.rt_rating,
            vote_average: m.tmdb_rating,
          }),
        }
      : r;
  });
  // Re-scoring corrects the number on screen but doesn't remove the film, so a
  // rec dealt before the IMDb fame cap could still sit in the marquee showing
  // ◆◇◇◇◇ under a dial whose floor is ◆◆. Obscurity 1 means everyone has met
  // it — Pride & Prejudice, No Country, Kill Bill — and "movies you haven't seen
  // yet" is the whole promise, so those are never a valid deal at any dial
  // setting. Retire them rather than displaying a film that contradicts the
  // filter it was dealt under.
  const stale = recs.filter(
    (r) => r.status === "active" && typeof r.obscurity === "number" && r.obscurity < 2,
  );
  if (stale.length > 0) {
    // Dismissed, not deleted: that keeps them in the exclusion list so the
    // engine never deals them again. Fire-and-forget — a failed cleanup must
    // never cost the reader their recs.
    void db
      .from("recommendations")
      .update({ status: "dismissed" })
      .eq("user_id", user.id)
      .in("id", stale.map((r) => r.id as string))
      .then(undefined, () => undefined);
  }
  const staleIds = new Set(stale.map((r) => r.id));
  const live = recs.filter((r) => !staleIds.has(r.id));

  // ── Best first, newest deal first ──
  //
  // The query orders by created_at desc, and the engine inserts in three
  // passes: the LLM's taste-matched picks, then loved-similar, then the
  // generic vault fill. Newest-first therefore printed them in exactly
  // reverse order of quality — the taste-free vault pulls at the top, and the
  // single best-matched film of the batch below the ad slot at index 3.
  //
  // So ranking moved to gem, and that fixed quality — but production then
  // showed the other failure mode: a fresh batch of quiet gems (gem 0-2)
  // sorted below older, louder cards, and the member who just paid a deal
  // scrolled "nothing new anywhere". Batch is therefore the first key: the
  // highest batch number is tonight's deal, ranked by gem within itself, and
  // everything older is the shelf beneath it.
  //
  // Watchlisted rows stay pinned below active ones: those are films the
  // member has already chosen to keep, so they are a shelf, not tonight's
  // deal. Within a tie, obscurity then recency — deeper cuts first, because
  // that is what the dial was asked for.
  const rank = (r: Record<string, unknown>) => {
    const gem = typeof r.gem === "number" ? r.gem : 0;
    const obscurity = typeof r.obscurity === "number" ? r.obscurity : 0;
    const created = typeof r.created_at === "string" ? Date.parse(r.created_at) : 0;
    const batch = typeof r.batch === "number" ? r.batch : 0;
    return { active: r.status === "active" ? 1 : 0, batch, gem, obscurity, created };
  };
  live.sort((a, b) => {
    const x = rank(a as Record<string, unknown>);
    const y = rank(b as Record<string, unknown>);
    return (
      y.active - x.active ||
      y.batch - x.batch ||
      y.gem - x.gem ||
      y.obscurity - x.obscurity ||
      (Number.isFinite(y.created) ? y.created : 0) - (Number.isFinite(x.created) ? x.created : 0)
    );
  });

  return NextResponse.json({ recs: live });
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

  // General Admission gets FREE_REC_BATCHES/day; Balcony Seats gets the full
  // house; the projectionist (admin) is never cut off — unlimited spins for
  // testing the engine.
  if (!isAdminEmail(user.email)) {
    const premium = await isPremium(user.id);
    const limit = premium ? DAILY_LIMITS.rec_batch : FREE_REC_BATCHES;
    const allowed = await checkAndIncrement(user.id, "rec_batch", limit);
    if (!allowed) {
      return NextResponse.json(
        { error: "rate_limited", limit: `${limit} deals/day`, premium },
        { status: 429 },
      );
    }
  }

  try {
    // Geo as the fallback region, so a member who has never opened Settings
    // still gets their own country's catalogue rather than America's.
    const recs = await dealRecs(user.id, {
      ...parsed.data,
      region: regionFromRequest(request) ?? undefined,
    });
    if (recs.length === 0) await refund(user.id, "rec_batch"); // empty deal = free
    return NextResponse.json({ dealt: recs.length, recs });
  } catch (err) {
    await refund(user.id, "rec_batch"); // errors shouldn't burn quota
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
