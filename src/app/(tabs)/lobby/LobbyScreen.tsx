"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { actorName, type FeedItem } from "@/lib/feed";
import MarqueeBulbs from "@/components/MarqueeBulbs";
import AdSlot from "@/components/AdSlot";
import FollowButton from "@/components/FollowButton";
import InviteButton from "@/components/InviteButton";
import Poster from "@/components/Poster";
import Avatar from "@/components/Avatar";
import FilmLeader from "@/components/FilmLeader";
import { sfxClick, sfxPop, haptic } from "@/lib/sfx";
import { toast } from "@/lib/toast";

const REACTION_LABEL: Record<string, string> = {
  loved: "loved",
  fine: "was lukewarm on",
  not_for_me: "bounced off",
  loved_ironically: "ironically loved",
};

// Verdict stamps pressed onto the poster, like a ticket-taker's rubber stamp.
const REACTION_STAMP: Record<string, { text: string; gold: boolean }> = {
  loved: { text: "Loved it", gold: true },
  loved_ironically: { text: "Camp classic", gold: true },
  fine: { text: "It's fine", gold: false },
  not_for_me: { text: "Walked out", gold: false },
};

interface Person {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

const personName = (p: Person) => p.display_name ?? (p.handle ? `@${p.handle}` : "someone");
const profileHref = (p: { id: string; handle: string | null }) => `/u/${p.handle ?? p.id}`;

const feedName = (actor: { id: string; handle: string | null; display_name: string | null }, myId: string) =>
  actor.id === myId ? "You" : actorName(actor);

export default function LobbyScreen({ myId }: { myId: string }) {
  const [view, setView] = useState<"feed" | "people">("feed");
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // People view state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[] | null>(null);
  const [followingList, setFollowingList] = useState<Person[]>([]);
  const [followers, setFollowers] = useState<Person[]>([]);
  const [peopleLoaded, setPeopleLoaded] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/feed");
    if (res.ok) {
      const data = await res.json();
      setFeed(data.feed ?? []);
      setFollowing(data.following ?? []);
    }
    setLoading(false);
  }, []);

  const loadPeople = useCallback(async () => {
    const res = await fetch("/api/people");
    if (res.ok) {
      const data = await res.json();
      setFollowingList(data.following ?? []);
      setFollowers(data.followers ?? []);
      setFollowing(data.followingIds ?? []);
    }
    setPeopleLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (view === "people" && !peopleLoaded) void loadPeople();
  }, [view, peopleLoaded, loadPeople]);

  // Debounced people search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query.trim()) {
      setResults(null);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/people?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results ?? []);
        setFollowing(data.followingIds ?? []);
      }
    }, 300);
  }, [query]);

  async function addToWatchlist(movieId: number) {
    sfxPop();
    haptic(20);
    toast("Swiped to your watchlist", { tone: "amber", icon: "＋" });
    await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movieId, source: "lobby" }),
    });
  }

  function PersonRow({ p }: { p: Person }) {
    return (
      <li className="flex items-center justify-between gap-2 rounded border border-line bg-surface p-3">
        <Link href={profileHref(p)} className="flex min-w-0 items-center gap-2.5">
          <Avatar url={p.avatar_url} name={personName(p)} size="md" />
          <span className="min-w-0">
          <span className="block truncate font-display text-lg text-cream">
            {personName(p)}
          </span>
          {p.handle && p.display_name && (
            <span className="font-mono text-[0.65rem] text-dim">@{p.handle}</span>
          )}
          </span>
        </Link>
        {p.id !== myId && (
          <FollowButton userId={p.id} initiallyFollowing={following.includes(p.id)} />
        )}
      </li>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <header>
        <MarqueeBulbs />
        <p className="eyebrow mt-2">Community</p>
        <h1 className="neon-flicker font-display text-5xl leading-[0.95] text-amber">
          {view === "feed" ? "WHAT FRIENDS ARE WATCHING" : "FIND YOUR PEOPLE"}
        </h1>
      </header>

      <div className="flex gap-1.5">
        {(
          [
            { key: "feed", label: "☰ The marquee" },
            { key: "people", label: "★ People" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => {
              sfxClick();
              setView(t.key);
            }}
            aria-pressed={view === t.key}
            className={`rounded-full border px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider ${
              view === t.key
                ? "border-amber bg-surface text-amber glow-amber"
                : "border-line bg-surface text-dim"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Link
        href="/settle"
        onClick={() => sfxPop()}
        className="film-card flex items-center gap-3 rounded-lg p-3"
      >
        <span aria-hidden className="text-3xl">⚖️</span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-2xl leading-tight text-amber">
            SETTLE IT
          </span>
          <span className="font-mono text-[0.65rem] text-dim">
            Two of you, one phone, one movie — the house picks. →
          </span>
        </span>
        <span className="stamp stamp-gold shrink-0">Party</span>
      </Link>

      {view === "people" ? (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by handle or name…"
            aria-label="Search people"
            className="rounded border-2 border-amber/60 bg-surface px-3 py-2.5 text-cream placeholder:text-dim/60"
          />

          {results !== null ? (
            results.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <p className="text-sm text-dim">Nobody by that name yet — deal them in.</p>
                <InviteButton />
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {results.map((p) => (
                  <PersonRow key={p.id} p={p} />
                ))}
              </ul>
            )
          ) : !peopleLoaded ? (
            <p className="animate-pulse py-6 text-center font-mono text-xs text-dim">
              checking the guest list…
            </p>
          ) : (
            <>
              <div>
                <p className="eyebrow mb-2">Following ({followingList.length})</p>
                {followingList.length === 0 ? (
                  <p className="text-sm text-dim">
                    You&apos;re not following anyone yet. Search above, or send a friend a
                    mixtape to get them in here.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {followingList.map((p) => (
                      <PersonRow key={p.id} p={p} />
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="eyebrow mb-2">Followers ({followers.length})</p>
                {followers.length === 0 ? (
                  <p className="text-sm text-dim">No followers yet — share your taste card.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {followers.map((p) => (
                      <PersonRow key={p.id} p={p} />
                    ))}
                  </ul>
                )}
              </div>

              <InviteButton card />
            </>
          )}
        </>
      ) : loading ? (
        <FilmLeader label="the lobby lights are coming up" />
      ) : feed.length === 0 ? (
        <div className="ticket-edge rounded p-6 text-center">
          <p className="font-display text-2xl text-cream">QUIET IN HERE</p>
          <p className="mt-1 text-sm text-dim">
            Log a watch with “Seen it” or follow people in the ★ People tab — watches and
            mixtapes light up this marquee.
          </p>
          <div className="mt-3 flex justify-center">
            <InviteButton />
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {feed.map((item, idx) => {
            const stamp = item.kind === "watch" ? REACTION_STAMP[item.reaction] : null;
            return (
              <li key={`${item.kind}-${item.id}`}>
                {idx === 2 && (
                  <div className="mb-4">
                    <AdSlot index={1} slot="lobby-feed" />
                  </div>
                )}

                {item.kind === "watch" && (
                  <div
                    className="film-card deal-in flex gap-3 rounded-lg p-3"
                    style={{ "--i": idx } as CSSProperties}
                  >
                    <Link href={`/m/${item.movie.id}`} className="wiggle relative w-20 shrink-0">
                      <Poster
                        posterPath={item.movie.poster_path}
                        title={item.movie.title}
                        year={item.movie.year}
                        genres={item.movie.genres}
                      />
                      {stamp && (
                        <span
                          className={`stamp absolute -left-2 top-2 ${stamp.gold ? "stamp-gold" : ""}`}
                        >
                          {stamp.text}
                        </span>
                      )}
                    </Link>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-widest text-dim">
                        <Avatar url={item.actor.avatar_url} name={feedName(item.actor, myId)} size="sm" />
                        <span>
                          <Link href={profileHref(item.actor)} className="text-amber">
                            {feedName(item.actor, myId)}
                          </Link>{" "}
                          {REACTION_LABEL[item.reaction] ?? item.reaction}
                        </span>
                      </p>
                      <Link
                        href={`/m/${item.movie.id}`}
                        className="mt-0.5 font-display text-2xl leading-tight text-cream"
                      >
                        {item.movie.title}
                      </Link>
                      <p className="font-mono text-[0.6rem] text-dim">
                        {item.movie.year ?? ""}
                        {item.movie.genres.length
                          ? ` · ${item.movie.genres.slice(0, 2).join(" / ")}`
                          : ""}
                        {item.why ? ` · for the ${item.why}` : ""}
                      </p>
                      {item.note && (
                        <p className="mt-1.5 border-l-2 border-amber/50 pl-2 text-sm italic text-cream/85">
                          “{item.note}”
                        </p>
                      )}
                      {item.actor.id !== myId && (
                        <div className="mt-auto pt-2">
                          <button
                            onClick={() => {
                              sfxPop();
                              void addToWatchlist(item.movie.id);
                            }}
                            className="rounded border border-amber px-2.5 py-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-amber"
                          >
                            + Watchlist
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {item.kind === "playlist" && (
                  <Link
                    href={`/p/${item.shareSlug}`}
                    className="ticket-edge deal-in block rounded bg-surface p-4"
                    style={{ "--i": idx } as CSSProperties}
                  >
                    <p className="font-mono text-[0.65rem] uppercase tracking-widest text-ticket">
                      ✉ Mixtape sealed by{" "}
                      <span className="text-amber">{feedName(item.actor, myId)}</span>
                    </p>
                    <p className="mt-1 font-display text-2xl leading-tight text-cream">
                      {item.name}
                    </p>
                    <p className="mt-0.5 font-mono text-[0.6rem] text-dim">
                      {item.filmCount} film{item.filmCount === 1 ? "" : "s"} inside — open it ↗
                    </p>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
