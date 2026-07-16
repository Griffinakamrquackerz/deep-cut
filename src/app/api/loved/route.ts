import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { LovedInput } from "@/lib/schemas";
import { cacheMovie } from "@/lib/tmdb";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = LovedInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const movie = await cacheMovie(parsed.data.movieId).catch(() => null);
  if (!movie) return NextResponse.json({ error: "unknown_movie" }, { status: 404 });

  const { error } = await supabaseAdmin()
    .from("loved_movies")
    .upsert({ user_id: user.id, movie_id: movie.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = LovedInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  await supabaseAdmin()
    .from("loved_movies")
    .delete()
    .eq("user_id", user.id)
    .eq("movie_id", parsed.data.movieId);
  return NextResponse.json({ ok: true });
}
