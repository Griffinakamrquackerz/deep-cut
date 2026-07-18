import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { getVisibilityMap } from "@/lib/playlist-visibility";
import PlaylistDetail, { type PlaylistItemView } from "@/components/PlaylistDetail";

// Public share page — viewable logged out; crossing off prompts signup.
export default async function SharedPlaylistPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = supabaseAdmin();

  const { data: playlist } = await db
    .from("playlists")
    .select(
      "id, name, owner_id, recipient_name, share_slug, users!playlists_owner_id_fkey(handle, display_name), playlist_items(id, crossed_off, reaction, note, position, movies(id, title, year, poster_path, genres, runtime))",
    )
    .eq("share_slug", slug)
    .maybeSingle();
  if (!playlist) notFound();

  const user = await currentUser();
  const isOwner = user?.id === playlist.owner_id;

  // Private tapes are for the owner's eyes only — everyone else gets a 404.
  const vis = await getVisibilityMap(db, [playlist.id as string]);
  const isPublic = vis.get(playlist.id as string) ?? true;
  if (!isPublic && !isOwner) notFound();

  const owner = playlist.users as unknown as {
    handle: string | null;
    display_name: string | null;
  } | null;
  const ownerName = owner?.handle ? `@${owner.handle}` : (owner?.display_name ?? "a friend");

  return (
    <PlaylistDetail
      playlistId={playlist.id as string}
      name={playlist.name}
      ownerName={ownerName}
      recipientName={playlist.recipient_name}
      slug={slug}
      items={JSON.parse(JSON.stringify(playlist.playlist_items ?? [])) as PlaylistItemView[]}
      viewerIsOwner={isOwner}
      viewerLoggedIn={!!user}
      isPublic={isPublic}
    />
  );
}
