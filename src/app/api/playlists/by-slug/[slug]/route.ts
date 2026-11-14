import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVisibilityMap } from "@/lib/playlist-visibility";

// Shared-mixtape detail by slug — the native counterpart to the web /p/[slug]
// page, so opening a mixtape from the feed or a profile stays in the app.
// Public (respects private-tape visibility); returns the same shape as
// /api/playlists/[id] so the native detail view can render either.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const db = supabaseAdmin();

  const { data: playlist } = await db
    .from("playlists")
    .select(
      "id, name, owner_id, recipient_name, share_slug, users!playlists_owner_id_fkey(handle, display_name), playlist_items(id, crossed_off, reaction, note, position, movies(id, title, year, poster_path, genres, runtime, tmdb_rating, imdb_rating, rt_rating))",
    )
    .eq("share_slug", slug)
    .maybeSingle();
  if (!playlist) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const user = await currentUser();
  const isOwner = user?.id === playlist.owner_id;

  const vis = await getVisibilityMap(db, [playlist.id as string]);
  const isPublic = vis.get(playlist.id as string) ?? true;
  if (!isPublic && !isOwner) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const owner = playlist.users as unknown as {
    handle: string | null;
    display_name: string | null;
  } | null;
  const ownerName = isOwner
    ? "you"
    : owner?.handle
      ? `@${owner.handle}`
      : (owner?.display_name ?? "a friend");

  return NextResponse.json({
    id: playlist.id,
    name: playlist.name,
    ownerName,
    recipientName: playlist.recipient_name ?? null,
    slug: playlist.share_slug,
    viewerIsOwner: isOwner,
    isPublic,
    items: playlist.playlist_items ?? [],
  });
}
