import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { mergeFeed, type FeedItem, type FeedActor, type FeedMovie } from "@/lib/feed";
import { getBlockedIds } from "@/lib/safety";
import { getVisibilityMap } from "@/lib/playlist-visibility";

type Row = Record<string, unknown>;

function toActor(u: unknown): FeedActor {
  const x = (u ?? {}) as Row;
  return {
    id: String(x.id ?? ""),
    handle: (x.handle as string | null) ?? null,
    display_name: (x.display_name as string | null) ?? null,
    avatar_url: (x.avatar_url as string | null) ?? null,
  };
}

function toMovie(m: unknown): FeedMovie | null {
  const x = m as Row | null;
  if (!x) return null;
  return {
    id: Number(x.id),
    title: String(x.title),
    year: (x.year as number | null) ?? null,
    poster_path: (x.poster_path as string | null) ?? null,
    genres: (x.genres as string[]) ?? [],
  };
}

/** Derived Lobby feed: watches + new playlists from people you follow. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = supabaseAdmin();
  const { data: followRows } = await db
    .from("follows")
    .select("followee_id")
    .eq("follower_id", user.id);
  const followees = (followRows ?? []).map((r) => r.followee_id);
  // Your own watches and mixtapes belong on the marquee too — otherwise a
  // new user who follows nobody stares at an empty room.
  const blocked = await getBlockedIds(user.id);
  const actorIds = [user.id, ...followees.filter((id) => !blocked.has(id))];

  const [watches, playlists] = await Promise.all([
    db
      .from("watch_logs")
      .select(
        "id, reaction, why, note, watched_at, users(id, handle, display_name, avatar_url), movies(id, title, year, poster_path, genres)",
      )
      .in("user_id", actorIds)
      .order("watched_at", { ascending: false })
      .limit(30),
    db
      .from("playlists")
      .select(
        "id, name, share_slug, created_at, users!playlists_owner_id_fkey(id, handle, display_name, avatar_url), playlist_items(id)",
      )
      .in("owner_id", actorIds)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const items: FeedItem[] = [];

  for (const w of (watches.data ?? []) as Row[]) {
    const movie = toMovie(w.movies);
    if (!movie) continue;
    items.push({
      kind: "watch",
      id: String(w.id),
      at: String(w.watched_at),
      actor: toActor(w.users),
      movie,
      reaction: String(w.reaction),
      why: (w.why as string | null) ?? null,
      note: (w.note as string | null) ?? null,
    });
  }

  // Private mixtapes never surface in the feed, even from people you follow.
  const plRows = (playlists.data ?? []) as Row[];
  const vis = await getVisibilityMap(db, plRows.map((p) => String(p.id)));
  for (const p of plRows) {
    if (vis.get(String(p.id)) === false) continue;
    items.push({
      kind: "playlist",
      id: String(p.id),
      at: String(p.created_at),
      actor: toActor(p.users),
      name: String(p.name),
      filmCount: Array.isArray(p.playlist_items) ? p.playlist_items.length : 0,
      shareSlug: String(p.share_slug),
    });
  }

  return NextResponse.json({ feed: mergeFeed(items), following: followees });
}
