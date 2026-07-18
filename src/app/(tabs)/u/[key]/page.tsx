import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { themeClass } from "@/lib/themes";
import { resolveStyle } from "@/lib/profile-style";
import { getMovieStills } from "@/lib/tmdb";
import { computeTasteStats } from "@/lib/rank";
import ProfileView, { type MovieLite } from "@/components/ProfileView";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public member profile — their taste card, loved films, watches, mixtapes. */
export default async function ProfilePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const db = supabaseAdmin();

  // Style columns arrive with migration 0004 — retry with the legacy shape.
  const cols = "id, handle, display_name, avatar_url, profile_theme, signature_movie_id";
  const legacyCols = "id, handle, display_name, avatar_url";
  const byId = UUID_RE.test(key);
  const fetchPerson = async (columns: string) =>
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
  if (!person) notFound();

  // Theme + signature film: columns when migrated, events fallback otherwise.
  const style = await resolveStyle(person.id, person);

  const me = await currentUser();
  const isMe = me?.id === person.id;

  const [profile, loved, watches, playlists, followerCount, followingCount, iFollow] =
    await Promise.all([
      db.from("taste_profiles").select("threads").eq("user_id", person.id).maybeSingle(),
      db
        .from("loved_movies")
        .select("movie_id, movies(id, title, year, poster_path, genres, vote_count)")
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

  const tasteVotes = [...(loved.data ?? []), ...(watches.data ?? [])]
    .map((r) => r.movies as unknown as { id: number; vote_count: number | null } | null)
    .filter((m): m is { id: number; vote_count: number | null } => !!m);
  const stats = computeTasteStats(tasteVotes);

  const threads = (profile.data?.threads ?? []) as Array<{ title: string; line: string }>;
  const lovedMovies = (loved.data ?? [])
    .map((r) => r.movies as unknown as MovieLite | null)
    .filter((m): m is MovieLite => !!m);

  const inner = (
    <section className={`${themeClass(style.theme)} flex flex-col gap-5`}>
      <ProfileView
        person={{
          id: person.id,
          handle: person.handle,
          display_name: person.display_name,
          avatar_url: person.avatar_url,
        }}
        stats={stats}
        threads={threads}
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
        watches={(watches.data ?? []).map((w) => ({
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
        isMe={isMe}
        viewerSignedIn={!!me}
        iFollow={!!iFollow.data}
      />
    </section>
  );

  if (me) return inner;

  // Signed-out visitors arriving from a shared link get the card plus a door in.
  return (
    <main className="px-4 pb-16 pt-6">
      <Link href="/" className="mb-5 block text-center">
        <span className="eyebrow">Deep Cut</span>
        <span className="block font-display text-2xl text-amber">MOVIES YOU HAVEN&apos;T MET YET</span>
      </Link>
      {inner}
      <Link
        href="/login"
        className="pulse-cta mt-8 block w-full rounded bg-ticket px-6 py-4 text-center font-mono text-sm font-medium uppercase tracking-[0.25em] text-cream"
      >
        🎟 Get your own taste card
      </Link>
    </main>
  );
}
