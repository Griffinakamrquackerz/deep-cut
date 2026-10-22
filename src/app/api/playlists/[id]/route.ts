import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVisibilityMap } from "@/lib/playlist-visibility";

// Playlist detail for the native mixtapes room. Returns the same shape the web
// owner page (tabs)/playlists/[id]/page.tsx hands to PlaylistDetail — items with
// movies, visibility, and whether the viewer owns the tape. Accessible to the
// owner or the claimed recipient; link-only viewers use /p/[slug] on the web.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = supabaseAdmin();
  const { data: playlist } = await db
    .from("playlists")
    .select(
      "id, name, owner_id, recipient_name, recipient_user_id, share_slug, playlist_items(id, crossed_off, reaction, note, position, movies(id, title, year, poster_path, genres, runtime, tmdb_rating, imdb_rating, rt_rating)), users!playlists_owner_id_fkey(handle, display_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!playlist) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const isOwner = (playlist.owner_id as string) === user.id;
  const isRecipient = (playlist.recipient_user_id as string | null) === user.id;
  if (!isOwner && !isRecipient) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const owner = playlist.users as unknown as {
    handle: string | null;
    display_name: string | null;
  } | null;
  const ownerName = isOwner
    ? "you"
    : owner?.handle
      ? `@${owner.handle}`
      : (owner?.display_name ?? "someone");

  const vis = await getVisibilityMap(db, [playlist.id as string]);

  return NextResponse.json({
    id: playlist.id,
    name: playlist.name,
    ownerName,
    recipientName: playlist.recipient_name ?? null,
    slug: playlist.share_slug,
    viewerIsOwner: isOwner,
    isPublic: vis.get(playlist.id as string) ?? true,
    items: playlist.playlist_items ?? [],
  });
}
