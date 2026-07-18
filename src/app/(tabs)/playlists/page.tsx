import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVisibilityMap } from "@/lib/playlist-visibility";
import PlaylistsScreen from "./PlaylistsScreen";

export default async function PlaylistsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const db = supabaseAdmin();
  const [sent, received, watchlist, loved] = await Promise.all([
    db
      .from("playlists")
      .select("id, name, recipient_name, share_slug, created_at, playlist_items(crossed_off)")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false }),
    db
      .from("playlists")
      .select("id, name, share_slug, created_at, playlist_items(crossed_off)")
      .eq("recipient_user_id", user.id)
      .order("created_at", { ascending: false }),
    db
      .from("recommendations")
      .select("movies(id, title, year)")
      .eq("user_id", user.id)
      .eq("status", "watchlisted"),
    db.from("loved_movies").select("movies(id, title, year)").eq("user_id", user.id),
  ]);

  const dedupe = new Map<number, { id: number; title: string; year: number | null }>();
  for (const rows of [watchlist.data ?? [], loved.data ?? []]) {
    for (const r of rows) {
      const m = r.movies as unknown as { id: number; title: string; year: number | null } | null;
      if (m && !dedupe.has(m.id)) dedupe.set(m.id, m);
    }
  }

  const sentVis = await getVisibilityMap(db, (sent.data ?? []).map((p) => p.id as string));
  const sentWithVis = (sent.data ?? []).map((p) => ({
    ...p,
    is_public: sentVis.get(p.id as string) ?? true,
  }));

  return (
    <PlaylistsScreen
      sent={JSON.parse(JSON.stringify(sentWithVis))}
      received={JSON.parse(JSON.stringify(received.data ?? []))}
      pickPool={[...dedupe.values()]}
    />
  );
}
