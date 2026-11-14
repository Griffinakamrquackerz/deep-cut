import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveStyle } from "@/lib/profile-style";
import { spotifyConfigured, findFilmTheme } from "@/lib/spotify";
import { getMovieStills } from "@/lib/tmdb";
import { computeTasteStats } from "@/lib/rank";
import { getVisibilityMap } from "@/lib/playlist-visibility";
import { tonightCard } from "@/lib/tonight";

export const maxDuration = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Full public member card for the native /u/[key] room — the same payload the
// web server page (tabs)/u/[key]/page.tsx assembles: person, theme, signature
// shrine, taste stats, threads, loved films, watches, mixtapes, follow counts.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const db = supabaseAdmin();

  // Style columns arrive with migration 0004 — retry with the legacy shape.
  const cols = "id, handle, display_name, avatar_url, profile_theme, signature_movie_id";
  const legacyCols = "id, handle, display_name, avatar_url";
  const byId = UUID_RE.test(key);
  const fetchPerson = (columns: string) =>
    byId
      ? db.from("users").select(columns).eq("id", key).maybeSingle()
      : db.from("users").select(columns).eq("handle", key.toLowerCase()).maybeSingle();
  let { data: personRow, error: personErr } = await fetchPerson(cols);
  if (personErr) ({ data: personRow } = await fetchPerson(legacyCols));
  const person = personRow as unknown as {
    id: string;
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
    profile_theme?: string | null;
    signature_movie_id?: number | null;
  } | null;
  if (!person) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const style = await resolveStyle(person.id, person);
  const me = await currentUser();
  const isMe = me?.id === person.id;

  const [profile, loved, watches, playlists, followerCount, followingCount, iFollow, tonight] =
    await Promise.all([
      db.from("taste_profiles").select("threads").eq("user_id", person.id).maybeSingle(),
      db
        .from("loved_movies")
        .select("movie_id, movies(id, title, year, poster_path, genres, vote_count, tmdb_rating, imdb_rating, rt_rating)")
        .eq("user_id", person.id)
        .order("added_at", { ascending: false })
        .limit(200),
      db
        .from("watch_logs")
        .select("id, reaction, note, watched_at, movies(id, title, year, vote_count)")
        .eq("user_id", person.id)
        .order("watched_at", { ascending: false })
        .limit(100),
      db
        .from("playlists")
        .select("id, name, share_slug, created_at, playlist_items(id)")
        .eq("owner_id", person.id)
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("followee_id", person.id),
      db
        .from("follows")
        .select("followee_id", { count: "exact", head: true })
        .eq("follower_id", person.id),
      me && !isMe
        ? db
            .from("follows")
            .select("followee_id")
            .eq("follower_id", me.id)
            .eq("followee_id", person.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      // Pre-migration-0012 this table doesn't exist; no plan is the right
      // fallback, not a broken card.
      tonightCard(db, person.id).catch(() => null),
    ]);

  const [{ data: sigMovie }, sigStills] = style.signatureMovieId
    ? await Promise.all([
        db
          .from("movies")
          .select("id, title, year, poster_path")
          .eq("id", style.signatureMovieId)
          .maybeSingle(),
        getMovieStills(style.signatureMovieId).catch(() => [] as string[]),
      ])
    : [{ data: null }, [] as string[]];

  // Effective theme song: the owner's pinned override, else auto-matched from
  // the signature film (same as the web turntable) when Spotify is configured.
  let themeMusic: { kind: "track" | "album"; id: string } | null = style.themeMusic;
  if (!themeMusic && sigMovie?.title && spotifyConfigured()) {
    const matched = await findFilmTheme(
      sigMovie.title as string,
      (sigMovie.year as number | null) ?? null,
    ).catch(() => null);
    if (matched) themeMusic = { kind: matched.kind, id: matched.id };
  }

  const tasteVotes = [...(loved.data ?? []), ...(watches.data ?? [])]
    .map((r) => r.movies as unknown as { id: number; vote_count: number | null } | null)
    .filter((m): m is { id: number; vote_count: number | null } => !!m);
  const stats = computeTasteStats(tasteVotes);

  const lovedMovies = (loved.data ?? [])
    .map((r) => {
      const m = r.movies as unknown as Record<string, unknown> | null;
      if (!m) return null;
      return {
        id: m.id as number,
        title: m.title as string,
        year: (m.year as number | null) ?? null,
        poster_path: (m.poster_path as string | null) ?? null,
        genres: (m.genres as string[]) ?? [],
        tmdb: m.tmdb_rating != null ? Number(m.tmdb_rating) : null,
        imdb: m.imdb_rating != null ? Number(m.imdb_rating) : null,
        rt: m.rt_rating != null ? Number(m.rt_rating) : null,
      };
    })
    .filter((m): m is NonNullable<typeof m> => !!m);

  // Private mixtapes only show to their owner.
  const plVis = await getVisibilityMap(db, (playlists.data ?? []).map((p) => p.id as string));
  const playlistsForView = (playlists.data ?? [])
    .map((p) => ({
      id: p.id as string,
      name: p.name as string,
      share_slug: p.share_slug as string,
      itemCount: Array.isArray(p.playlist_items) ? p.playlist_items.length : 0,
      isPublic: plVis.get(p.id as string) ?? true,
    }))
    .filter((p) => isMe || p.isPublic);

  return NextResponse.json({
    person: {
      id: person.id,
      handle: person.handle,
      display_name: person.display_name,
      avatar_url: person.avatar_url,
    },
    theme: style.theme ?? "marquee",
    themeMusic,
    signature: sigMovie
      ? {
          id: sigMovie.id,
          title: sigMovie.title,
          year: sigMovie.year,
          posterPath: sigMovie.poster_path,
          stills: sigStills,
        }
      : null,
    stats,
    threads: (profile.data?.threads ?? []) as Array<{ title: string; line: string }>,
    lovedMovies,
    watches: (watches.data ?? []).map((w) => ({
      id: w.id as string,
      reaction: w.reaction as string,
      note: (w.note as string | null) ?? null,
      movies:
        (w.movies as unknown as { id: number; title: string; year: number | null } | null) ?? null,
    })),
    playlists: playlistsForView,
    tonight,
    followerCount: followerCount.count ?? 0,
    followingCount: followingCount.count ?? 0,
    isMe,
    iFollow: !!iFollow.data,
  });
}
