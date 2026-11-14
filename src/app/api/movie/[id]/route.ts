import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cacheMovie, getMovieCredits, getMovieTrailer } from "@/lib/tmdb";
import type { Service } from "@/lib/services";
import { effectiveObscurity } from "@/lib/obscurity";
import { gemScore } from "@/lib/gem";

// Movie detail for the native /m/[id] room — the same data the web server page
// (tabs)/m/[id]/page.tsx assembles: the cached movie (providers, ratings,
// overview), its trailer, external reads, and the viewer's own services so the
// availability line can highlight what they can stream.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const tmdbId = Number(id);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }

  const movie = await cacheMovie(tmdbId).catch(() => null);
  if (!movie) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const user = await currentUser();
  const db = supabaseAdmin();
  const [reads, mine, trailer, credits] = await Promise.all([
    db
      // user_id so the page can tell whose link it is. It is NOT sent to the
      // client — it becomes a `mine` boolean below, because the page has no
      // business publishing member ids next to their links.
      .from("external_reads")
      .select("id, title, url, user_id")
      .eq("movie_id", tmdbId)
      .order("created_at", { ascending: false })
      .limit(10),
    user
      ? db.from("user_services").select("service").eq("user_id", user.id)
      : Promise.resolve({ data: [] as Array<{ service: string }> }),
    getMovieTrailer(tmdbId).catch(() => null), // best-effort — page works without one
    getMovieCredits(tmdbId).catch(() => ({ cast: [], crew: [] })),
  ]);

  const myServices = ((mine.data ?? []) as Array<{ service: string }>).map(
    (r) => r.service as Service,
  );

  return NextResponse.json({
    movie: {
      id: movie.id,
      title: movie.title,
      year: movie.year,
      runtime: movie.runtime,
      poster_path: movie.poster_path,
      overview: movie.overview,
      genres: movie.genres,
      imdb_id: movie.imdb_id,
      providers: movie.providers,
      ratings: movie.ratings,
      imdb_votes: movie.imdb_votes,
      obscurity: effectiveObscurity(movie),
      gem: gemScore({
        vote_count: movie.vote_count,
        imdb_votes: movie.imdb_votes,
        imdb_rating: movie.ratings.imdb,
        rt_rating: movie.ratings.rt,
        vote_average: movie.ratings.tmdb,
      }),
    },
    myServices,
    trailerKey: trailer?.key ?? null,
    // `mine` rather than user_id: the app needs to know which control to
    // draw (remove vs report), and it has no business receiving the id of the
    // member who posted a link.
    reads: (reads.data ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      mine: !!user && r.user_id === user.id,
    })),
    cast: credits.cast,
    crew: credits.crew,
  });
}
