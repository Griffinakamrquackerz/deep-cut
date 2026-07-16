"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Poster from "@/components/Poster";
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
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/takes");
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

  async function toggleLike(item: Extract<FeedItem, { kind: "take" }>) {
    setFeed((prev) =>
      prev.map((f) =>
        f.kind === "take" && f.id === item.id
          ? { ...f, likedByMe: !f.likedByMe, likes: f.likes + (f.likedByMe ? -1 : 1) }
          : f,
      ),
    );
    await fetch(`/api/takes/${item.id}/like`, { method: "POST" });
  }

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

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="eyebrow">The Lobby</p>
          <h1 className="font-display text-4xl text-cream">SHORT TAKES</h1>
        </div>
        <button
          onClick={() => setComposing(true)}
          className="rounded bg-ticket px-3 py-2 font-mono text-xs font-medium uppercase tracking-widest text-cream"
        >
          + Take
        </button>
      </header>

      {composing && (
        <TakeComposer
          onDone={() => {
            setComposing(false);
            void load();
          }}
          onCancel={() => setComposing(false)}
        />
      )}

      {loading ? (
        <p className="animate-pulse py-10 text-center font-mono text-xs text-dim">
          the lobby lights are coming up…
        </p>
      ) : feed.length === 0 ? (
        <div className="ticket-edge rounded p-6 text-center">
          <p className="font-display text-2xl text-cream">QUIET IN HERE</p>
          <p className="mt-1 text-sm text-dim">
            Follow people or send a playlist — the lobby fills up fast.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {feed.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="rounded border border-line bg-surface p-3">
              {item.kind === "take" && (
                <div className="flex gap-3">
                  <Link href={`/m/${item.movie.id}`} className="w-14 shrink-0">
                    <Poster
                      posterPath={item.movie.poster_path}
                      title={item.movie.title}
                      year={item.movie.year}
                      genres={item.movie.genres}
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[0.65rem] text-dim">
                      <span className="text-amber">{actorName(item.actor)}</span> on{" "}
                      <Link href={`/m/${item.movie.id}`} className="text-cream underline">
                        {item.movie.title}
                      </Link>
                      {item.actor.id !== myId && (
                        <button
                          onClick={() => toggleFollow(item.actor.id)}
                          className="ml-2 text-[0.6rem] uppercase tracking-wider text-ticket"
                        >
                          {following.includes(item.actor.id) ? "following ✓" : "+ follow"}
                        </button>
                      )}
                    </p>
                    <p className="mt-1 text-sm text-cream">{item.body}</p>
                    <div className="mt-2 flex gap-3 font-mono text-[0.65rem] text-dim">
                      <button
                        onClick={() => void toggleLike(item)}
                        className={item.likedByMe ? "text-ticket" : ""}
                      >
                        ♥ {item.likes}
                      </button>
                      <button onClick={() => void addToWatchlist(item.movie.id)}>
                        + watchlist
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {item.kind === "watch" && (
                <p className="text-sm text-dim">
                  <span className="font-mono text-[0.7rem] text-amber">{actorName(item.actor)}</span>{" "}
                  {REACTION_LABEL[item.reaction] ?? item.reaction}{" "}
                  <Link href={`/m/${item.movie.id}`} className="text-cream underline">
                    {item.movie.title}
                  </Link>
                  {item.why ? ` — ${item.why}` : ""}
                  {item.note ? (
                    <span className="block italic text-cream/80">“{item.note}”</span>
                  ) : null}
                </p>
              )}

              {item.kind === "playlist" && (
                <p className="text-sm text-dim">
                  <span className="font-mono text-[0.7rem] text-amber">{actorName(item.actor)}</span>{" "}
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

function TakeComposer({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: number; title: string; year: number | null }>>([]);
  const [movie, setMovie] = useState<{ id: number; title: string; year: number | null } | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function search(q: string) {
    setQuery(q);
    if (!q.trim()) return setResults([]);
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    if (res.ok) setResults(((await res.json()).results ?? []).slice(0, 5));
  }

  async function post() {
    if (!movie || !body.trim()) return;
    setBusy(true);
    await fetch("/api/takes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movieId: movie.id, body: body.trim() }),
    });
    setBusy(false);
    onDone();
  }

  return (
    <div className="rounded border border-amber bg-surface p-3">
      {!movie ? (
        <>
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => void search(e.target.value)}
            placeholder="Which film is this take about?"
            className="w-full rounded border border-line bg-bg px-3 py-2 text-sm text-cream placeholder:text-dim/60"
          />
          {results.length > 0 && (
            <ul className="mt-2 divide-y divide-line rounded border border-line">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setMovie(r)}
                    className="w-full px-3 py-2 text-left text-sm text-cream"
                  >
                    {r.title} <span className="font-mono text-xs text-dim">{r.year ?? ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <p className="font-mono text-[0.65rem] text-dim">
            Take on <span className="text-amber">{movie.title}</span>{" "}
            <button onClick={() => setMovie(null)} className="text-ticket underline">
              change
            </button>
          </p>
          <textarea
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 300))}
            rows={3}
            placeholder="≤300 characters. Make it sting."
            className="mt-2 w-full rounded border border-line bg-bg px-3 py-2 text-sm text-cream placeholder:text-dim/60"
          />
          <p className="text-right font-mono text-[0.6rem] text-dim">{body.length}/300</p>
        </>
      )}
      <div className="mt-2 flex gap-2">
        <button
          onClick={onCancel}
          className="rounded border border-line px-3 py-2 font-mono text-[0.65rem] uppercase tracking-wider text-dim"
        >
          Cancel
        </button>
        <button
          disabled={!movie || !body.trim() || busy}
          onClick={() => void post()}
          className="flex-1 rounded bg-amber px-3 py-2 font-mono text-[0.65rem] font-medium uppercase tracking-wider text-bg disabled:opacity-40"
        >
          {busy ? "Posting…" : "Post take"}
        </button>
      </div>
    </div>
  );
}
