import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { TakeInput } from "@/lib/schemas";
import { cacheMovie } from "@/lib/tmdb";
import { mergeFeed, type FeedItem, type FeedActor, type FeedMovie } from "@/lib/feed";
import { track } from "@/lib/analytics";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = TakeInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  const movie = await cacheMovie(parsed.data.movieId).catch(() => null);
  if (!movie) return NextResponse.json({ error: "unknown_movie" }, { status: 404 });

  const { data, error } = await supabaseAdmin()
    .from("takes")
    .insert({ user_id: user.id, movie_id: movie.id, body: parsed.data.body })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await track(user.id, "take_posted", { takeId: data.id, movieId: movie.id });
  return NextResponse.json({ id: data.id });
}

type Row = Record<string, unknown>;

function toActor(u: unknown): FeedActor {
  const x = (u ?? {}) as Row;
  return {
    id: String(x.id ?? ""),
    handle: (x.handle as string | null) ?? null,
    display_name: (x.display_name as string | null) ?? null,
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

/** Derived Lobby feed: my follows' takes, watches, and new playlists (+ my own takes). */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = supabaseAdmin();
  const { data: followRows } = await db
    .from("follows")
    .select("followee_id")
    .eq("follower_id", user.id);
  const followees = (followRows ?? []).map((r) => r.followee_id);
  const actors = [...followees, user.id];

  const [takes, myLikes, watches, playlists] = await Promise.all([
    db
      .from("takes")
      .select(
        "id, body, created_at, users(id, handle, display_name), movies(id, title, year, poster_path, genres), take_likes(user_id)",
      )
      .in("user_id", actors)
      .order("created_at", { ascending: false })
      .limit(40),
    db.from("take_likes").select("take_id").eq("user_id", user.id),
    followees.length
      ? db
          .from("watch_logs")
          .select(
            "id, reaction, why, note, watched_at, users(id, handle, display_name), movies(id, title, year, poster_path, genres)",
          )
          .in("user_id", followees)
          .order("watched_at", { ascending: false })
          .limit(25)
      : Promise.resolve({ data: [] as Row[] }),
    followees.length
      ? db
          .from("playlists")
          .select("id, name, share_slug, created_at, users!playlists_owner_id_fkey(id, handle, display_name), playlist_items(id)")
          .in("owner_id", followees)
          .order("created_at", { ascending: false })
          .limit(15)
      : Promise.resolve({ data: [] as Row[] }),
  ]);

  const likedSet = new Set(((myLikes.data ?? []) as Row[]).map((r) => String(r.take_id)));
  const items: FeedItem[] = [];

  for (const t of (takes.data ?? []) as Row[]) {
    const movie = toMovie(t.movies);
    if (!movie) continue;
    items.push({
      kind: "take",
      id: String(t.id),
      at: String(t.created_at),
      actor: toActor(t.users),
      movie,
      body: String(t.body),
      likes: Array.isArray(t.take_likes) ? t.take_likes.length : 0,
      likedByMe: likedSet.has(String(t.id)),
    });
  }

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

  for (const p of (playlists.data ?? []) as Row[]) {
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
