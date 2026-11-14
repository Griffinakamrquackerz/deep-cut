import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVisibilityMap } from "@/lib/playlist-visibility";
import { PlaylistCreateInput } from "@/lib/schemas";
import { makeShareSlug } from "@/lib/slug";
import { cacheMovies } from "@/lib/tmdb";
import { track } from "@/lib/analytics";

/** Playlists I sent + playlists sent to me, plus the create pool (my
 *  watchlist + loved films) so the native mixtapes screen loads in one call.
 *  Mirrors what the web (tabs)/playlists/page.tsx server component assembles. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = supabaseAdmin();
  const [sent, received, watchlist, loved] = await Promise.all([
    db
      .from("playlists")
      .select("id, name, recipient_name, share_slug, created_at, playlist_items(crossed_off)")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false }),
    db
      .from("playlists")
      .select("id, name, share_slug, created_at, playlist_items(crossed_off), users!playlists_owner_id_fkey(handle, display_name)")
      .eq("recipient_user_id", user.id)
      .order("created_at", { ascending: false }),
    db
      .from("recommendations")
      .select("movies(id, title, year)")
      .eq("user_id", user.id)
      .eq("status", "watchlisted"),
    db.from("loved_movies").select("movies(id, title, year)").eq("user_id", user.id),
  ]);

  // Enrich sent tapes with visibility (public/private), matching the web page.
  const sentRows = sent.data ?? [];
  const vis = await getVisibilityMap(db, sentRows.map((p) => p.id as string));
  const sentWithVis = sentRows.map((p) => ({ ...p, is_public: vis.get(p.id as string) ?? true }));

  // Dedupe the create pool across watchlist + loved.
  const dedupe = new Map<number, { id: number; title: string; year: number | null }>();
  for (const rows of [watchlist.data ?? [], loved.data ?? []]) {
    for (const r of rows) {
      const m = r.movies as unknown as { id: number; title: string; year: number | null } | null;
      if (m && !dedupe.has(m.id)) dedupe.set(m.id, m);
    }
  }

  return NextResponse.json({
    sent: sentWithVis,
    received: received.data ?? [],
    pickPool: [...dedupe.values()],
  });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = PlaylistCreateInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { name, recipientName, movieIds } = parsed.data;

  const cached = await cacheMovies(movieIds);
  if (cached.length === 0) return NextResponse.json({ error: "no_valid_movies" }, { status: 400 });

  const db = supabaseAdmin();
  const share_slug = makeShareSlug();
  const { data: playlist, error } = await db
    .from("playlists")
    .insert({
      owner_id: user.id,
      name,
      recipient_name: recipientName ?? null,
      share_slug,
    })
    .select("id, share_slug")
    .single();
  if (error || !playlist) {
    return NextResponse.json({ error: error?.message ?? "create_failed" }, { status: 500 });
  }

  const validIds = new Set(cached.map((m) => m.id));
  const items = movieIds
    .filter((id) => validIds.has(id))
    .map((movie_id, i) => ({ playlist_id: playlist.id, movie_id, position: i }));
  const { error: itemsErr } = await db.from("playlist_items").insert(items);
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

  await track(user.id, "playlist_created", { playlistId: playlist.id, films: items.length });
  return NextResponse.json({ id: playlist.id, shareSlug: playlist.share_slug });
}
