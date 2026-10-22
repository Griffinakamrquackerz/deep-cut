import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { computeStreak } from "@/lib/streak";

// Normalize a joined movies row into a lite card shape with ratings + genres.
function movieLite(raw: unknown) {
  const m = raw as Record<string, unknown> | null;
  if (!m) return null;
  return {
    id: m.id as number,
    title: m.title as string,
    year: (m.year as number | null) ?? null,
    poster_path: (m.poster_path as string | null) ?? null,
    genres: (m.genres as string[]) ?? [],
    tmdb: m.tmdb_rating != null ? Number(m.tmdb_rating) : null,
    imdb: m.imdb_rating != null ? Number(m.imdb_rating) : null,
    rt: m.rt_rating != null ? Number(m.rt_rating) : null,
  };
}

// The You-tab "booth" payload — the management data that sits below the member
// card on the native You tab: your handle, watch streak, watchlist, and loved
// films (for the shape-your-taste editor). Mirrors what the web you/page.tsx
// server component assembles.
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = supabaseAdmin();
  const [meRes, watchlist, loved, history] = await Promise.all([
    db.from("users").select("handle").eq("id", user.id).maybeSingle(),
    db
      .from("recommendations")
      .select("id, obscurity, movies(id, title, year, poster_path, genres, tmdb_rating, imdb_rating, rt_rating)")
      .eq("user_id", user.id)
      .eq("status", "watchlisted")
      .order("created_at", { ascending: false }),
    db
      .from("loved_movies")
      .select("movie_id, movies(id, title, year, poster_path, genres, tmdb_rating, imdb_rating, rt_rating)")
      .eq("user_id", user.id)
      .order("added_at", { ascending: false }),
    db
      .from("watch_logs")
      .select("watched_at")
      .eq("user_id", user.id)
      .order("watched_at", { ascending: false })
      .limit(200),
  ]);

  const streak = computeStreak(
    (history.data ?? []).map((r) => r.watched_at as string),
    Date.now(),
  );

  const watchlistOut = (watchlist.data ?? [])
    .map((w) => {
      const m = movieLite(w.movies);
      return m ? { id: w.id as string, obscurity: (w.obscurity as number) ?? 0, movie: m } : null;
    })
    .filter(Boolean);

  const lovedOut = (loved.data ?? []).map((l) => movieLite(l.movies)).filter(Boolean);

  return NextResponse.json({
    handle: meRes.data?.handle ?? null,
    streak,
    watchlist: watchlistOut,
    loved: lovedOut,
  });
}
