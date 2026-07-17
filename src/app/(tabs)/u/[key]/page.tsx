import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import Poster from "@/components/Poster";
import FollowButton from "@/components/FollowButton";
import MarqueeBulbs from "@/components/MarqueeBulbs";
import ShowMore from "@/components/ShowMore";

const REACTION_LABEL: Record<string, string> = {
  loved: "loved",
  fine: "thought it was fine",
  not_for_me: "bounced off",
  loved_ironically: "ironically loved",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface MovieLite {
  id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  genres: string[];
}

/** Public member profile — their taste card, loved films, watches, mixtapes. */
export default async function ProfilePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const db = supabaseAdmin();

  const lookup = UUID_RE.test(key)
    ? db.from("users").select("id, handle, display_name").eq("id", key).maybeSingle()
    : db
        .from("users")
        .select("id, handle, display_name")
        .eq("handle", key.toLowerCase())
        .maybeSingle();
  const { data: person } = await lookup;
  if (!person) notFound();

  const me = await currentUser();
  const isMe = me?.id === person.id;

  const [profile, loved, watches, playlists, followerCount, followingCount, iFollow] =
    await Promise.all([
      db.from("taste_profiles").select("threads").eq("user_id", person.id).maybeSingle(),
      db
        .from("loved_movies")
        .select("movie_id, movies(id, title, year, poster_path, genres)")
        .eq("user_id", person.id)
        .order("added_at", { ascending: false })
        .limit(200),
      db
        .from("watch_logs")
        .select("id, reaction, note, watched_at, movies(id, title, year)")
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

  const name = person.display_name ?? (person.handle ? `@${person.handle}` : "A film person");
  const threads = (profile.data?.threads ?? []) as Array<{ title: string; line: string }>;
  const lovedMovies = (loved.data ?? [])
    .map((r) => r.movies as unknown as MovieLite | null)
    .filter((m): m is MovieLite => !!m);

  return (
    <section className="flex flex-col gap-5">
      <header>
        <MarqueeBulbs />
        <p className="eyebrow mt-2">Member card</p>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="glow-amber font-display text-4xl leading-tight text-amber">
              {name.toUpperCase()}
            </h1>
            {person.handle && person.display_name && (
              <p className="font-mono text-xs text-dim">@{person.handle}</p>
            )}
            <p className="mt-1 font-mono text-[0.65rem] text-dim">
              {followerCount.count ?? 0} follower{(followerCount.count ?? 0) === 1 ? "" : "s"} ·{" "}
              following {followingCount.count ?? 0}
            </p>
          </div>
          {isMe ? (
            <Link
              href="/you"
              className="rounded border border-line px-3 py-2 font-mono text-[0.65rem] uppercase tracking-widest text-dim"
            >
              This is you ★
            </Link>
          ) : me ? (
            <FollowButton userId={person.id} initiallyFollowing={!!iFollow.data} size="lg" />
          ) : null}
        </div>
      </header>

      {threads.length > 0 && (
        <div className="ticket-edge rounded bg-surface p-4">
          <p className="eyebrow mb-2">Their taste</p>
          <ul className="flex flex-col gap-3">
            {threads.map((t) => (
              <li key={t.title}>
                <p className="font-mono text-xs uppercase tracking-widest text-ticket">
                  {t.title}
                </p>
                <p className="mt-0.5 text-sm text-cream">{t.line}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lovedMovies.length > 0 && (
        <div>
          <p className="eyebrow mb-2">
            Films they love ({lovedMovies.length})
          </p>
          <ShowMore initial={12} step={24} wrapperClassName="grid grid-cols-4 gap-2" label="Roll more posters">
            {lovedMovies.map((m) => (
              <Link key={m.id} href={`/m/${m.id}`} className="wiggle">
                <Poster
                  posterPath={m.poster_path}
                  title={m.title}
                  year={m.year}
                  genres={m.genres}
                />
              </Link>
            ))}
          </ShowMore>
        </div>
      )}

      <div>
        <p className="eyebrow mb-2">Recent watches</p>
        {(watches.data ?? []).length === 0 ? (
          <p className="text-sm text-dim">Nothing logged yet.</p>
        ) : (
          <ShowMore initial={8} step={16} wrapperClassName="flex flex-col gap-2" label="Roll more watches">
            {(watches.data ?? []).map((w) => {
              const m = w.movies as unknown as { id: number; title: string; year: number | null } | null;
              if (!m) return null;
              return (
                <div key={w.id} className="rounded border border-line bg-surface p-3 text-sm">
                  <span className="text-dim">{REACTION_LABEL[w.reaction] ?? w.reaction} </span>
                  <Link href={`/m/${m.id}`} className="text-cream underline">
                    {m.title}
                  </Link>{" "}
                  <span className="font-mono text-xs text-dim">{m.year ?? ""}</span>
                  {w.note && <p className="mt-1 text-xs italic text-cream/80">“{w.note}”</p>}
                </div>
              );
            })}
          </ShowMore>
        )}
      </div>

      {(playlists.data ?? []).length > 0 && (
        <div>
          <p className="eyebrow mb-2">Mixtapes they sealed</p>
          <ul className="flex flex-col gap-2">
            {(playlists.data ?? []).map((p) => (
              <li key={p.id}>
                <Link
                  href={`/p/${p.share_slug}`}
                  className="flex items-center justify-between rounded border border-line bg-surface p-3"
                >
                  <span className="font-display text-lg text-cream">{p.name}</span>
                  <span className="font-mono text-[0.65rem] text-dim">
                    {Array.isArray(p.playlist_items) ? p.playlist_items.length : 0} films ↗
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
