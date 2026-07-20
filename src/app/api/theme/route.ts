import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  spotifyConfigured,
  findFilmTheme,
  searchThemeCandidates,
  type FilmTheme,
} from "@/lib/spotify";

export const maxDuration = 60;

// Profile theme music resolver.
//   GET ?movieId=123           → auto-matched FilmTheme for that film
//   GET ?q=jaws main title     → candidate list for the owner's override picker
// Returns { configured:false } when Spotify keys are absent, so the client
// simply renders nothing — the whole feature is dark until keys land.

// Warm-lambda cache of resolved themes so we don't re-hit Spotify per view.
const themeCache = new Map<number, FilmTheme | null>();

export async function GET(request: Request) {
  if (!spotifyConfigured()) {
    return NextResponse.json({ configured: false });
  }
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  if (q) {
    const candidates = await searchThemeCandidates(q.slice(0, 120));
    return NextResponse.json({ configured: true, candidates });
  }

  const movieId = Number(url.searchParams.get("movieId"));
  if (!Number.isInteger(movieId) || movieId <= 0) {
    return NextResponse.json({ error: "bad_movie_id" }, { status: 400 });
  }
  if (themeCache.has(movieId)) {
    return NextResponse.json({ configured: true, theme: themeCache.get(movieId) ?? null });
  }

  const { data: movie } = await supabaseAdmin()
    .from("movies")
    .select("title, year")
    .eq("id", movieId)
    .maybeSingle();
  if (!movie?.title) {
    return NextResponse.json({ configured: true, theme: null });
  }

  const theme = await findFilmTheme(movie.title as string, (movie.year as number | null) ?? null);
  themeCache.set(movieId, theme);
  return NextResponse.json({ configured: true, theme });
}
