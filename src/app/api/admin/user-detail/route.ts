import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * God-mode peek at one member: their watchlist (saved deals) plus activity
 * counts. Admin-only — watchlists aren't public anywhere else in the app.
 */
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const userId = new URL(req.url).searchParams.get("id");
  if (!userId) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const db = supabaseAdmin();
  const [watchlist, loved, watches] = await Promise.all([
    db
      .from("recommendations")
      .select("id, reason, obscurity, created_at, movies(id, title, year, poster_path)")
      .eq("user_id", userId)
      .eq("status", "watchlisted")
      .order("created_at", { ascending: false })
      .limit(100),
    db.from("loved_movies").select("movie_id", { count: "exact", head: true }).eq("user_id", userId),
    db.from("watch_logs").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  const items = (watchlist.data ?? [])
    .map((r) => {
      const m = r.movies as unknown as {
        id: number;
        title: string;
        year: number | null;
        poster_path: string | null;
      } | null;
      if (!m) return null;
      return {
        movieId: m.id,
        title: m.title,
        year: m.year,
        posterPath: m.poster_path,
        reason: r.reason as string,
        obscurity: r.obscurity as number,
        savedAt: r.created_at as string,
      };
    })
    .filter(Boolean);

  return NextResponse.json({
    watchlist: items,
    counts: {
      watchlist: items.length,
      loved: loved.count ?? 0,
      watches: watches.count ?? 0,
    },
  });
}
