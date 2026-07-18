"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Poster from "@/components/Poster";
import ObscurityDots from "@/components/ObscurityDots";
import ShowMore from "@/components/ShowMore";
import LetterboxdImport from "@/components/LetterboxdImport";
import StreakBadge from "@/components/StreakBadge";
import RankUp from "@/components/RankUp";
import type { StreakStats } from "@/lib/streak";
import type { TasteStats } from "@/lib/rank";

interface MovieLite {
  id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  genres: string[];
}

/**
 * Your booth — the management tools that sit BELOW the profile view on the You
 * tab. The profile itself (member card, shrine, rank, taste, loved, watches,
 * mixtapes) is rendered by the shared ProfileView so your tab looks exactly
 * like your public page; this is just where you shape it.
 */
export default function YouScreen(props: {
  stats: TasteStats;
  streak: StreakStats;
  handle: string | null;
  watchlist: Array<{ id: string; reason: string; obscurity: number; movies: MovieLite | null }>;
  loved: Array<{ movie_id: number; movies: MovieLite | null }>;
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refreshProfile() {
    setRefreshing(true);
    setMsg(null);
    const res = await fetch("/api/profile/generate", { method: "POST" });
    if (res.status === 429) setMsg("One refresh a day — your taste needs time to marinate.");
    else if (!res.ok) setMsg("Refresh failed. Try again later.");
    setRefreshing(false);
    router.refresh();
  }

  function shareCard() {
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "taste_card_share_tapped", props: {} }),
    });
    window.open("/api/taste-card", "_blank");
  }

  async function shareProfileLink() {
    if (!props.handle) {
      router.push("/settings"); // handle lives there now
      return;
    }
    const url = `${window.location.origin}/u/${props.handle}`;
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "profile_link_shared", props: {} }),
    });
    if (navigator.share) {
      await navigator.share({ title: "My Deep Cut taste card", url }).catch(() => null);
    } else {
      await navigator.clipboard.writeText(url);
      setMsg("Link copied — anyone can see your card, no account needed.");
    }
  }

  return (
    <div className="mt-1 flex flex-col gap-5 border-t border-dashed border-line pt-6">
      {/* Promotion ceremony (fires only when your rank title changes) */}
      <RankUp rankTitle={props.stats.rank.title} glyph={props.stats.rank.glyph} />

      <p className="eyebrow">Your booth · manage your card</p>

      <StreakBadge streak={props.streak} />

      {/* Share + refresh toolbar */}
      <div className="flex gap-2">
        <button
          onClick={() => void shareProfileLink()}
          className="flex-1 rounded bg-amber px-3 py-2.5 font-mono text-xs font-medium uppercase tracking-widest text-bg"
        >
          🎟 Share my card
        </button>
        <button
          onClick={shareCard}
          className="rounded border border-amber px-3 py-2.5 font-mono text-xs uppercase tracking-widest text-amber"
        >
          As image
        </button>
        <button
          onClick={refreshProfile}
          disabled={refreshing}
          className="rounded border border-line px-3 py-2.5 font-mono text-xs uppercase tracking-widest text-dim disabled:opacity-50"
        >
          {refreshing ? "…" : "Refresh taste"}
        </button>
      </div>
      {msg && <p className="font-mono text-xs text-ticket">{msg}</p>}

      {/* Watchlist — saved picks, unique to your tab */}
      <div>
        <p className="eyebrow mb-2">Your watchlist</p>
        <ul className="grid grid-cols-3 gap-3">
          {props.watchlist.length === 0 && (
            <li className="col-span-3 text-center text-sm text-dim">
              Nothing saved yet — hit + Watchlist on a rec.
            </li>
          )}
          {props.watchlist.map((w) =>
            w.movies ? (
              <li key={w.id} className="flex flex-col gap-1">
                <Link href={`/m/${w.movies.id}`}>
                  <Poster
                    posterPath={w.movies.poster_path}
                    title={w.movies.title}
                    year={w.movies.year}
                    genres={w.movies.genres}
                  />
                </Link>
                <ObscurityDots score={w.obscurity} />
              </li>
            ) : null,
          )}
        </ul>
      </div>

      {/* Shape your taste — add/remove loved films + import */}
      <div>
        <p className="eyebrow mb-2">Shape your taste</p>
        <LovedSection loved={props.loved} onChanged={() => router.refresh()} />
      </div>
    </div>
  );
}

function LovedSection({
  loved,
  onChanged,
}: {
  loved: Array<{ movie_id: number; movies: MovieLite | null }>;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: number; title: string; year: number | null }>>([]);

  async function search(q: string) {
    setQuery(q);
    if (!q.trim()) return setResults([]);
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    if (res.ok) setResults((await res.json()).results ?? []);
  }

  async function add(id: number) {
    setQuery("");
    setResults([]);
    await fetch("/api/loved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movieId: id }),
    });
    onChanged();
  }

  async function remove(id: number) {
    await fetch("/api/loved", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movieId: id }),
    });
    onChanged();
  }

  return (
    <div className="flex flex-col gap-3">
      <LetterboxdImport onDone={onChanged} />
      <input
        type="search"
        value={query}
        onChange={(e) => void search(e.target.value)}
        placeholder="Search any film to add — all of TMDB…"
        aria-label="Search films to love"
        className="rounded border border-line bg-surface px-3 py-2.5 text-cream placeholder:text-dim/60"
      />
      <p className="font-mono text-[0.6rem] text-dim">
        Add or ✕ remove films, then hit <span className="text-amber">Refresh taste</span> up top to
        reshape your taste profile.
      </p>
      {results.length > 0 && (
        <ul className="divide-y divide-line rounded border border-line bg-surface">
          {results.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => void add(r.id)}
                className="flex w-full justify-between px-3 py-2 text-left text-sm"
              >
                <span>
                  {r.title} <span className="font-mono text-xs text-dim">{r.year ?? ""}</span>
                </span>
                <span className="text-amber">+</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <ShowMore initial={24} step={24} wrapperClassName="grid grid-cols-3 gap-3" label="Roll more posters">
        {loved.map((l) =>
          l.movies ? (
            <div key={l.movie_id} className="relative">
              <Link href={`/m/${l.movies.id}`}>
                <Poster
                  posterPath={l.movies.poster_path}
                  title={l.movies.title}
                  year={l.movies.year}
                  genres={l.movies.genres}
                />
              </Link>
              <button
                onClick={() => void remove(l.movie_id)}
                aria-label={`Remove ${l.movies.title} from loved films`}
                className="absolute right-1 top-1 rounded-full border border-line bg-bg/90 px-2 py-0.5 font-mono text-xs text-ticket"
              >
                ✕
              </button>
            </div>
          ) : null,
        )}
      </ShowMore>
    </div>
  );
}
