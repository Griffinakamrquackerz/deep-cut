import { NextResponse } from "next/server";
import { STARTER_GRID } from "@/lib/starter-grid";
import { getMovieDetails } from "@/lib/tmdb";
import { supabaseAdmin } from "@/lib/supabase/admin";

// First-ever call may fetch every starter film from TMDB; after that the
// movies cache answers with a single DB query.
export const maxDuration = 60;

/** Poster paths for the onboarding shelf, keyed by TMDB id. Public data. */
export async function GET() {
  const db = supabaseAdmin();
  const ids = STARTER_GRID.map((f) => f.tmdbId);
  const posters: Record<number, string | null> = {};

  const { data } = await db.from("movies").select("id, poster_path").in("id", ids);
  for (const r of data ?? []) {
    if (r.poster_path) posters[r.id] = r.poster_path;
  }

  const missing = ids.filter((id) => !posters[id]);
  const CHUNK = 22; // stay well under TMDB's burst limits
  for (let i = 0; i < missing.length; i += CHUNK) {
    await Promise.all(
      missing.slice(i, i + CHUNK).map(async (id) => {
        const m = await getMovieDetails(id).catch(() => null);
        if (!m) return;
        posters[id] = m.poster_path;
        // Warm the movies cache; only pre-0003 columns, so this is safe
        // whether or not the ratings migration has been applied.
        await db.from("movies").upsert({
          id: m.id,
          title: m.title,
          year: m.year,
          runtime: m.runtime,
          poster_path: m.poster_path,
          overview: m.overview,
          genres: m.genres,
          popularity: m.popularity,
          vote_count: m.vote_count,
        });
      }),
    );
  }

  return NextResponse.json({ posters });
}
