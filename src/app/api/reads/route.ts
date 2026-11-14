import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ExternalReadInput } from "@/lib/schemas";
import { cacheMovie } from "@/lib/tmdb";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = ExternalReadInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  const movie = await cacheMovie(parsed.data.movieId).catch(() => null);
  if (!movie) return NextResponse.json({ error: "unknown_movie" }, { status: 404 });

  const { error } = await supabaseAdmin().from("external_reads").insert({
    movie_id: movie.id,
    user_id: user.id,
    title: parsed.data.title,
    url: parsed.data.url,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * Take a link back down.
 *
 * This did not exist, and its absence was the problem. Any member could
 * publish an arbitrary URL onto any film page, visible to everyone, and there
 * was no way for the author, an admin, or anybody else to remove it — POST was
 * the only handler on the route and no admin surface touched the table. That
 * is a straight Guideline 1.2 failure (user-generated content with no means
 * of removal) as well as an obvious way to push links at the whole membership.
 *
 * Author or admin. The author because it's their link and people mistype;
 * admin because the reason Apple asks for this is the case where the author
 * is the problem.
 */
export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: row } = await db
    .from("external_reads")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();
  // Already gone is a success: two taps on a delete button shouldn't produce
  // an error the second time.
  if (!row) return NextResponse.json({ ok: true, alreadyGone: true });

  const mine = row.user_id === user.id;
  if (!mine && !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error } = await db.from("external_reads").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
