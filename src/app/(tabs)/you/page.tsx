import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import YouScreen from "./YouScreen";
import { computeTasteStats } from "@/lib/rank";
import { computeStreak } from "@/lib/streak";
import { resolveStyle } from "@/lib/profile-style";
import { getMovieStills } from "@/lib/tmdb";
import { themeClass } from "@/lib/themes";
import ProfileView, { type MovieLite } from "@/components/ProfileView";

export default async function YouPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const db = supabaseAdmin();

  // Style columns arrive with migration 0004 — retry with the legacy shape so
  // the signature film still resolves (via the events fallback) pre-migration.
  const styleCols = "handle, display_name, avatar_url, profile_theme, signature_movie_id";
  const legacyCols = "handle, display_name, avatar_url";
  let meRes = await db.from("users").select(styleCols).eq("id", user.id).maybeSingle();
  if (meRes.error) meRes = await db.from("users").select(legacyCols).eq("id", user.id).maybeSingle();
  const me = meRes.data as {
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
    profile_theme?: string | null;
    signature_movie_id?: number | null;
  } | null;

  const [profile, watchlist, loved, history, playlists, followerCount, followingCount] =
    await Promise.all([
      db.from("taste_profiles").select("threads, version, generated_at").eq("user_id", user.id).maybeSingle(),
      db
        .from("recommendations")
        .select("id, reason, obscurity, movies(id, title, year, poster_path, genres, providers)")
        .eq("user_id", user.id)
        .eq("status", "watchlisted")
        .order("created_at", { ascending: false }),
      db
        .from("loved_movies")
        .select("movie_id, movies(id, title, year, poster_path, genres, vote_count)")
        .eq("user_id", user.id)
        .order("added_at", { ascending: false }),
      db
        .from("watch_logs")
        .select("id, reaction, why, note, watched_at, movies(id, title, year, poster_path, genres, vote_count)")
        .eq("user_id", user.id)
        .order("watched_at", { ascending: false })
        .limit(200),
      db
        .from("playlists")
        .select("id, name, share_slug, created_at, playlist_items(id)")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      db.from("follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", user.id),
      db.from("follows").select("followee_id", { count: "exact", head: true }).eq("follower_id", user.id),
    ]);

  const votes = [...(loved.data ?? []), ...(history.data ?? [])]
    .map((r) => r.movies as unknown as { id: number; vote_count: number | null } | null)
    .filter((m): m is { id: number; vote_count: number | null } => !!m);
  const stats = computeTasteStats(votes);
  const streak = computeStreak(
    (history.data ?? []).map((r) => r.watched_at as string),
    Date.now(),
  );

  // Signature film — same shrine that fronts the public profile.
  const style = await resolveStyle(user.id, me);
  const [{ data: sigMovie }, sigStills] = style.signatureMovieId
    ? await Promise.all([
        db.from("movies").select("id, title, year, poster_path").eq("id", style.signatureMovieId).maybeSingle(),
        getMovieStills(style.signatureMovieId).catch(() => [] as string[]),
      ])
    : [{ data: null }, [] as string[]];

  const lovedMovies = (loved.data ?? [])
    .map((r) => r.movies as unknown as MovieLite | null)
    .filter((m): m is MovieLite => !!m);

  return (
    <section className={`${themeClass(style.theme)} flex flex-col gap-5`}>
      {/* Your card — the exact member view everyone else sees */}
      <ProfileView
        person={{
          id: user.id,
          handle: me?.handle ?? null,
          display_name: me?.display_name ?? null,
          avatar_url: me?.avatar_url ?? null,
        }}
        stats={stats}
        threads={(profile.data?.threads ?? []) as Array<{ title: string; line: string }>}
        signature={
          sigMovie
            ? {
                id: sigMovie.id,
                title: sigMovie.title,
                year: sigMovie.year,
                posterPath: sigMovie.poster_path,
                stills: sigStills,
              }
            : null
        }
        lovedMovies={lovedMovies}
        watches={(history.data ?? []).map((w) => ({
          id: w.id as string,
          reaction: w.reaction as string,
          note: (w.note as string | null) ?? null,
          movies: (w.movies as unknown as { id: number; title: string; year: number | null } | null) ?? null,
        }))}
        playlists={(playlists.data ?? []).map((p) => ({
          id: p.id as string,
          name: p.name as string,
          share_slug: p.share_slug as string,
          itemCount: Array.isArray(p.playlist_items) ? p.playlist_items.length : 0,
        }))}
        followerCount={followerCount.count ?? 0}
        followingCount={followingCount.count ?? 0}
        isMe
        viewerSignedIn
        iFollow={false}
      />

      {/* Your booth — the tools to shape the card above */}
      <YouScreen
        stats={stats}
        streak={streak}
        handle={me?.handle ?? null}
        watchlist={JSON.parse(JSON.stringify(watchlist.data ?? []))}
        loved={JSON.parse(JSON.stringify(loved.data ?? []))}
      />
    </section>
  );
}
