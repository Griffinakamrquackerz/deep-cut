"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { actorName, type FeedItem } from "@/lib/feed";
import MarqueeBulbs from "@/components/MarqueeBulbs";
import AdSlot from "@/components/AdSlot";
import FollowButton from "@/components/FollowButton";
import { sfxClick } from "@/lib/sfx";

const REACTION_LABEL: Record<string, string> = {
  loved: "loved",
  fine: "thought it was fine",
  not_for_me: "bounced off",
  loved_ironically: "ironically loved",
};

interface Person {
  id: string;
  handle: string | null;
  display_name: string | null;
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
    await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movieId, source: "lobby" }),
    });
  }

  function PersonRow({ p }: { p: Person }) {
    return (
      <li className="flex items-center justify-between gap-2 rounded border border-line bg-surface p-3">
        <Link href={profileHref(p)} className="min-w-0">
          <span className="block truncate font-display text-lg text-cream">
            {personName(p)}
          </span>
          {p.handle && p.display_name && (
            <span className="font-mono text-[0.65rem] text-dim">@{p.handle}</span>
          )}
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
        <h1 className="glow-amber font-display text-4xl text-amber">
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
              <p className="py-4 text-center text-sm text-dim">
                Nobody by that name yet — invite them with a mixtape.
              </p>
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
            </>
          )}
        </>
      ) : loading ? (
        <p className="animate-pulse py-10 text-center font-mono text-xs text-dim">
          the lobby lights are coming up…
        </p>
      ) : feed.length === 0 ? (
        <div className="ticket-edge rounded p-6 text-center">
          <p className="font-display text-2xl text-cream">QUIET IN HERE</p>
          <p className="mt-1 text-sm text-dim">
            Log a watch with “Seen it” or follow people in the ★ People tab — watches and
            mixtapes light up this marquee.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {feed.map((item, idx) => (
            <li key={`${item.kind}-${item.id}`} className="rounded border border-line bg-surface p-3">
              {idx === 2 && (
                <div className="mb-3">
                  <AdSlot index={1} slot="lobby-feed" />
                </div>
              )}
              {item.kind === "watch" && (
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-dim">
                    <Link
                      href={profileHref(item.actor)}
                      className="font-mono text-[0.7rem] text-amber underline decoration-amber/40"
                    >
                      {feedName(item.actor, myId)}
                    </Link>{" "}
                    {REACTION_LABEL[item.reaction] ?? item.reaction}{" "}
                    <Link href={`/m/${item.movie.id}`} className="text-cream underline">
                      {item.movie.title}
                    </Link>
                    {item.why ? ` — ${item.why}` : ""}
                    {item.note ? (
                      <span className="block italic text-cream/80">“{item.note}”</span>
                    ) : null}
                  </p>
                  {item.actor.id !== myId && (
                    <button
                      onClick={() => void addToWatchlist(item.movie.id)}
                      className="shrink-0 rounded border border-line px-2 py-1 font-mono text-[0.6rem] uppercase tracking-wider text-dim"
                    >
                      + watchlist
                    </button>
                  )}
                </div>
              )}

              {item.kind === "playlist" && (
                <p className="text-sm text-dim">
                  <Link
                    href={profileHref(item.actor)}
                    className="font-mono text-[0.7rem] text-amber underline decoration-amber/40"
                  >
                    {feedName(item.actor, myId)}
                  </Link>{" "}
                  sealed a mixtape:{" "}
                  <Link href={`/p/${item.shareSlug}`} className="text-cream underline">
                    {item.name}
                  </Link>{" "}
                  · {item.filmCount} films
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
