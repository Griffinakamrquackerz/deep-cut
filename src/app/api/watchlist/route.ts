import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cacheMovie } from "@/lib/tmdb";
import { obscurityFromVoteCount } from "@/lib/obscurity";
import { track } from "@/lib/analytics";

const Input = z.object({
  movieId: z.number().int().positive(),
  source: z.string().max(60).default("direct"),
});

/** Add a film to the watchlist from anywhere (feed, movie page) — batch 0, not a dealt rec. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const movie = await cacheMovie(parsed.data.movieId).catch(() => null);
  if (!movie) return NextResponse.json({ error: "unknown_movie" }, { status: 404 });

  const { error } = await supabaseAdmin().from("recommendations").upsert(
    {
      user_id: user.id,
      movie_id: movie.id,
      reason: `Saved from the ${parsed.data.source}`,
      obscurity: obscurityFromVoteCount(movie.vote_count),
      status: "watchlisted",
      batch: 0,
    },
    { onConflict: "user_id,movie_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await track(user.id, "rec_watchlisted", { movieId: movie.id, source: parsed.data.source });
  return NextResponse.json({ ok: true });
}
