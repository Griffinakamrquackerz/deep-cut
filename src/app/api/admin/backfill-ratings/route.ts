import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cacheMovie } from "@/lib/tmdb";
import { omdbConfigured } from "@/lib/omdb";

export const maxDuration = 300;

// One-off backfill: re-enrich every cached movie with ratings (TMDB always,
// IMDb + Rotten Tomatoes when OMDB_API_KEY is set). Safe to run repeatedly.
// Visit http://localhost:3000/api/admin/backfill-ratings while logged in.
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "log in first" }, { status: 401 });

  const db = supabaseAdmin();
  const { data: movies } = await db.from("movies").select("id");
  const ids = (movies ?? []).map((m) => m.id as number);

  let enriched = 0;
  for (const id of ids) {
    const m = await cacheMovie(id, { force: true }).catch(() => null);
    if (m) enriched++;
  }

  return NextResponse.json({
    ok: true,
    moviesProcessed: enriched,
    total: ids.length,
    omdb: omdbConfigured() ? "IMDb + Rotten Tomatoes enabled" : "OMDb key not set — TMDB rating only",
    note: "Reload the app to see ratings.",
  });
}
