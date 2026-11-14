import Link from "next/link";
import Poster from "@/components/Poster";
import FollowButton from "@/components/FollowButton";
import Avatar from "@/components/Avatar";
import SignatureShrine from "@/components/SignatureShrine";
import ShowMore from "@/components/ShowMore";
import ProjectionistCard from "@/components/ProjectionistCard";
import SafetyActions from "@/components/SafetyActions";
import TonightStatus from "@/components/TonightStatus";
import type { TasteStats } from "@/lib/rank";
import type { TonightCard } from "@/lib/tonight";
import CreditRoll from "@/components/house/CreditRoll";
import { tapeHue } from "@/lib/tape";
import { memberNo } from "@/lib/member-no";

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
  /** Their live "watching tonight" plan, if they have one up. */
  tonight?: TonightCard | null;
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
        {/* The membership card: laminated, a photo window, a number, a
            signature strip. The accents read the profile theme's tokens, so a
            noir member carries a noir card. */}
        <div className="member-card">
          <div className="member-card-top">
            <span className="member-card-brand">
              DEEP CUT<i>.</i> VIDEO
            </span>
            <span className="member-card-kind">Membership card</span>
          </div>
          <div className="member-card-body">
            <span className="member-card-photo">
              <Avatar url={person.avatar_url} name={name} size="lg" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="glow-amber font-display text-4xl leading-none text-amber">
                {name.toUpperCase()}
              </h1>
              {person.handle && person.display_name && (
                <p className="mt-1 font-mono text-xs text-dim">@{person.handle}</p>
              )}
              <p className="member-card-no">No. {memberNo(person.id)}</p>
            </div>
            {data.isMe ? (
              <Link
                href="/settings"
                className="self-start rounded border border-line px-3 py-2 font-mono text-[0.65rem] uppercase tracking-widest text-dim"
              >
                Style it
              </Link>
            ) : data.viewerSignedIn ? (
              <span className="self-start">
                <FollowButton userId={person.id} initiallyFollowing={data.iFollow} size="lg" />
              </span>
            ) : null}
          </div>
          <div className="member-card-foot">
            <span className="member-card-sig">{name}</span>
            <span className="member-card-bar" aria-hidden />
          </div>
          <p className="member-card-terms">
            {data.followerCount} follower{data.followerCount === 1 ? "" : "s"} · following {data.followingCount} ·
            not transferable
          </p>
        </div>
      </header>

      <TonightStatus
        initial={data.tonight ?? null}
        editable={data.isMe}
        name={person.handle ? `@${person.handle}` : (person.display_name ?? "They")}
      />

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
                  {w.note && <p className="mt-1 text-sm italic text-cream/80">“{w.note}”</p>}
                </div>
              );
            })}
          </ShowMore>
        )}
      </div>

      {data.playlists.length > 0 && (
        <div>
          <p className="eyebrow mb-2">{data.isMe ? "Mixtapes you sealed" : "Mixtapes they sealed"}</p>
          <ul className="flex flex-col gap-2.5">
            {data.playlists.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/p/${p.share_slug}`}
                  className="vhs"
                  style={{ "--hue": tapeHue(p.id) } as React.CSSProperties}
                >
                  <span className="vhs-label">
                    <span className="vhs-title">{p.name}</span>
                    <span className="vhs-meta">sealed by {name}</span>
                  </span>
                  <span className="vhs-side">
                    {data.isMe && !p.isPublic ? (
                      <span className="vhs-sticker">Private</span>
                    ) : (
                      <span>T-{String(p.itemCount * 20).padStart(3, "0")}</span>
                    )}
                    <span>
                      <b>{p.itemCount}</b> film{p.itemCount === 1 ? "" : "s"} ↗
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Every picture ends on its credits, and so does every member card:
          the films they love get top billing, their taste gets the writing
          credit, and whoever is reading gets thanked. Built from what's
          already on the card — nothing here is new information. */}
      {(data.lovedMovies.length > 0 || data.threads.length > 0) && (
        <div>
          <p className="eyebrow mb-2">The credits</p>
          <CreditRoll
            label={`Credits for ${name}`}
            credits={[
              { role: "a picture by", names: [name] },
              ...(data.lovedMovies.length > 0
                ? [{ role: "starring", names: data.lovedMovies.slice(0, 6).map((m) => m.title) }]
                : []),
              ...(data.signature ? [{ role: "signature film", names: [data.signature.title] }] : []),
              ...(data.threads.length > 0
                ? [{ role: "taste by", names: data.threads.map((t) => t.title) }]
                : []),
              ...(data.playlists.length > 0
                ? [{ role: "mixtapes", names: data.playlists.slice(0, 4).map((p) => p.name) }]
                : []),
            ]}
          />
        </div>
      )}

      {data.viewerSignedIn && !data.isMe && <SafetyActions userId={person.id} name={name} />}
    </>
  );
}
