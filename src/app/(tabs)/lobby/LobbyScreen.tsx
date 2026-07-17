"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { actorName, type FeedItem } from "@/lib/feed";

const REACTION_LABEL: Record<string, string> = {
  loved: "loved",
  fine: "thought it was fine",
  not_for_me: "bounced off",
  loved_ironically: "ironically loved",
};

export default function LobbyScreen({ myId }: { myId: string }) {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/feed");
    if (res.ok) {
      const data = await res.json();
      setFeed(data.feed ?? []);
      setFollowing(data.following ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addToWatchlist(movieId: number) {
    await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movieId, source: "lobby" }),
    });
  }

  async function toggleFollow(userId: string) {
    const isFollowing = following.includes(userId);
    setFollowing((prev) =>
      isFollowing ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
    await fetch("/api/follows", {
      method: isFollowing ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    void load();
  }

  function FollowButton({ userId }: { userId: string }) {
    if (userId === myId) return null;
    return (
      <button
        onClick={() => void toggleFollow(userId)}
        className="ml-2 font-mono text-[0.6rem] uppercase tracking-wider text-ticket"
      >
        {following.includes(userId) ? "following ✓" : "+ follow"}
      </button>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <header>
        <p className="eyebrow">The Lobby</p>
        <h1 className="font-display text-4xl text-cream">WHAT FRIENDS ARE WATCHING</h1>
      </header>

      {loading ? (
        <p className="animate-pulse py-10 text-center font-mono text-xs text-dim">
          the lobby lights are coming up…
        </p>
      ) : feed.length === 0 ? (
        <div className="ticket-edge rounded p-6 text-center">
          <p className="font-display text-2xl text-cream">QUIET IN HERE</p>
          <p className="mt-1 text-sm text-dim">
            Send someone a playlist — when they join, their watches show up here.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {feed.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="rounded border border-line bg-surface p-3">
              {item.kind === "watch" && (
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-dim">
                    <span className="font-mono text-[0.7rem] text-amber">
                      {actorName(item.actor)}
                    </span>{" "}
                    {REACTION_LABEL[item.reaction] ?? item.reaction}{" "}
                    <Link href={`/m/${item.movie.id}`} className="text-cream underline">
                      {item.movie.title}
                    </Link>
                    {item.why ? ` — ${item.why}` : ""}
                    {item.note ? (
                      <span className="block italic text-cream/80">“{item.note}”</span>
                    ) : null}
                    <FollowButton userId={item.actor.id} />
                  </p>
                  <button
                    onClick={() => void addToWatchlist(item.movie.id)}
                    className="shrink-0 rounded border border-line px-2 py-1 font-mono text-[0.6rem] uppercase tracking-wider text-dim"
                  >
                    + watchlist
                  </button>
                </div>
              )}

              {item.kind === "playlist" && (
                <p className="text-sm text-dim">
                  <span className="font-mono text-[0.7rem] text-amber">
                    {actorName(item.actor)}
                  </span>{" "}
                  sealed a mixtape:{" "}
                  <Link href={`/p/${item.shareSlug}`} className="text-cream underline">
                    {item.name}
                  </Link>{" "}
                  · {item.filmCount} films
                  <FollowButton userId={item.actor.id} />
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
