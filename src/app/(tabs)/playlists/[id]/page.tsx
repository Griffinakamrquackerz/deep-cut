import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import PlaylistDetail, { type PlaylistItemView } from "@/components/PlaylistDetail";

// Owner view: same detail UI + the share link and recipient activity.
export default async function PlaylistOwnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const db = supabaseAdmin();
  const { data: playlist } = await db
    .from("playlists")
    .select(
      "id, name, owner_id, recipient_name, recipient_user_id, share_slug, playlist_items(id, crossed_off, reaction, note, position, movies(id, title, year, poster_path, genres, runtime))",
    )
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!playlist) notFound();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const shareUrl = `${appUrl}/p/${playlist.share_slug}`;

  return (
    <div className="-mx-4 -mt-4">
      <div className="px-4 pt-4">
        <div className="ticket-edge rounded bg-surface p-3">
          <p className="eyebrow mb-1">Share link</p>
          <Link href={`/p/${playlist.share_slug}`} className="break-all font-mono text-xs text-amber">
            {shareUrl}
          </Link>
        </div>
      </div>
      <PlaylistDetail
        name={playlist.name}
        ownerName="you"
        recipientName={playlist.recipient_name}
        slug={playlist.share_slug}
        items={JSON.parse(JSON.stringify(playlist.playlist_items ?? [])) as PlaylistItemView[]}
        viewerIsOwner
        viewerLoggedIn
      />
    </div>
  );
}
