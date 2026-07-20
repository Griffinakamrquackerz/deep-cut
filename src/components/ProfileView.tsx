import Link from "next/link";
import Poster from "@/components/Poster";
import FollowButton from "@/components/FollowButton";
import MarqueeBulbs from "@/components/MarqueeBulbs";
import Avatar from "@/components/Avatar";
import SignatureShrine from "@/components/SignatureShrine";
import ShowMore from "@/components/ShowMore";
import ProjectionistCard from "@/components/ProjectionistCard";
import SafetyActions from "@/components/SafetyActions";
import type { TasteStats } from "@/lib/rank";

const REACTION_LABEL: Record<string, string> = {
  loved: "loved",
  fine: "thought it was fine",
  not_for_me: "bounced off",
  loved_ironically: "ironically loved",
};

export interface MovieLite {
  id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  genres: string[];
}

export interface ProfileViewData {
  person: {
    id: string;
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
  stats: TasteStats;
  threads: Array<{ title: string; line: string }>;
  signature: {
    id: number;
    title: string;
    year: number | null;
    posterPath: string | null;
    stills: string[];
  } | null;
  themeMusic: { kind: "track" | "album"; id: string } | null;
  lovedMovies: MovieLite[];
  watches: Array<{
    id: string;
    reaction: string;
    note: string | null;
    movies: { id: number; title: string; year: number | null } | null;
  }>;
  playlists: Array<{
    id: string;
    name: string;
    share_slug: string;
    itemCount: number;
    isPublic: boolean;
  }>;
  followerCount: number;
  followingCount: number;
  isMe: boolean;
  viewerSignedIn: boolean;
  iFollow: boolean;
}

/**
 * The member card — the single source of truth for how a profile looks. Both
 * the public profile page (/u/[key]) and your own You tab render this, so your
 * tab is literally what everyone else sees. Interactivity differs only by role:
 * it's you (edit link), a signed-in visitor (follow + safety), or a guest.
 */
export default function ProfileView(data: ProfileViewData) {
  const { person } = data;
  const name =
    person.display_name ?? (person.handle ? `@${person.handle}` : "A film person");

  return (
    <>
      <header>
        <MarqueeBulbs />
        <p className="eyebrow mt-2">Member card</p>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar url={person.avatar_url} name={name} size="lg" />
            <div className="min-w-0">
              <h1 className="glow-amber font-display text-4xl leading-tight text-amber">
                {name.toUpperCase()}
              </h1>
              {person.handle && person.display_name && (
                <p className="font-mono text-xs text-dim">@{person.handle}</p>
              )}
              <p className="mt-1 font-mono text-[0.65rem] text-dim">
                {data.followerCount} follower{data.followerCount === 1 ? "" : "s"} · following{" "}
                {data.followingCount}
              </p>
            </div>
          </div>
          {data.isMe ? (
            <Link
              href="/settings"
              className="rounded border border-line px-3 py-2 font-mono text-[0.65rem] uppercase tracking-widest text-dim"
            >
              Style it ✨
            </Link>
          ) : data.viewerSignedIn ? (
            <FollowButton userId={person.id} initiallyFollowing={data.iFollow} size="lg" />
          ) : null}
        </div>
      </header>

      {data.signature && (
        <SignatureShrine
          movieId={data.signature.id}
          title={data.signature.title}
          year={data.signature.year}
          stills={data.signature.stills}
          posterPath={data.signature.posterPath}
          isMe={data.isMe}
          themeMusic={data.themeMusic}
        />
      )}

      <ProjectionistCard stats={data.stats} isMe={data.isMe} />

      {data.threads.length > 0 && (
        <div className="ticket-edge ticket-stub rounded bg-surface p-4">
          <p className="eyebrow mb-2">{data.isMe ? "Your taste" : "Their taste"}</p>
          <ul className="flex flex-col gap-3">
            {data.threads.map((t) => (
              <li key={t.title}>
                <p className="font-mono text-xs uppercase tracking-widest text-ticket">{t.title}</p>
                <p className="mt-0.5 text-sm text-cream">{t.line}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.lovedMovies.length > 0 && (
        <div>
          <p className="eyebrow mb-2">
            {data.isMe ? "Films you love" : "Films they love"} ({data.lovedMovies.length})
          </p>
          <ShowMore
            initial={12}
            step={24}
            wrapperClassName="grid grid-cols-4 gap-2"
            label="Roll more posters"
          >
            {data.lovedMovies.map((m) => (
              <Link key={m.id} href={`/m/${m.id}`} className="wiggle">
                <Poster posterPath={m.poster_path} title={m.title} year={m.year} genres={m.genres} />
              </Link>
            ))}
          </ShowMore>
        </div>
      )}

      <div>
        <p className="eyebrow mb-2">Recent watches</p>
        {data.watches.length === 0 ? (
          <p className="text-sm text-dim">Nothing logged yet.</p>
        ) : (
          <ShowMore
            initial={8}
            step={16}
            wrapperClassName="flex flex-col gap-2"
            label="Roll more watches"
          >
            {data.watches.map((w) => {
              const m = w.movies;
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

      {data.playlists.length > 0 && (
        <div>
          <p className="eyebrow mb-2">{data.isMe ? "Mixtapes you sealed" : "Mixtapes they sealed"}</p>
          <ul className="flex flex-col gap-2">
            {data.playlists.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/p/${p.share_slug}`}
                  className="flex items-center justify-between rounded border border-line bg-surface p-3"
                >
                  <span className="flex items-center gap-2 font-display text-lg text-cream">
                    {p.name}
                    {data.isMe && !p.isPublic && (
                      <span className="rounded-sm border border-line px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-widest text-dim">
                        🔒 Private
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[0.65rem] text-dim">{p.itemCount} films ↗</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.viewerSignedIn && !data.isMe && <SafetyActions userId={person.id} name={name} />}
    </>
  );
}
