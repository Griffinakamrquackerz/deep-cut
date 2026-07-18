"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Poster from "@/components/Poster";
import ObscurityDots from "@/components/ObscurityDots";
import { SERVICES, SERVICE_LABELS, type Service } from "@/lib/services";
import MarqueeBulbs from "@/components/MarqueeBulbs";
import ShowMore from "@/components/ShowMore";
import LetterboxdImport from "@/components/LetterboxdImport";
import Avatar from "@/components/Avatar";
import ProjectionistCard from "@/components/ProjectionistCard";
import StreakBadge from "@/components/StreakBadge";
import type { StreakStats } from "@/lib/streak";
import RankUp from "@/components/RankUp";
import type { TasteStats } from "@/lib/rank";

interface MovieLite {
  id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  genres: string[];
}

interface Thread {
  title: string;
  line: string;
}

export default function YouScreen(props: {
  stats: TasteStats;
  streak: StreakStats;
  avatarUrl: string | null;
  threads: Thread[];
  version: number;
  handle: string | null;
  displayName: string | null;
  services: Service[];
  watchlist: Array<{ id: string; reason: string; obscurity: number; movies: MovieLite | null }>;
  loved: Array<{ movie_id: number; movies: MovieLite | null }>;
  history: Array<{
    id: string;
    reaction: string;
    why: string | null;
    note: string | null;
    watched_at: string;
    movies: MovieLite | null;
  }>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"watchlist" | "loved" | "history">("watchlist");
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
    // Native share sheet on phones; clipboard everywhere else.
    if (navigator.share) {
      await navigator.share({ title: "My Deep Cut taste card", url }).catch(() => null);
    } else {
      await navigator.clipboard.writeText(url);
      setMsg("Link copied — anyone can see your card, no account needed.");
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <MarqueeBulbs />
        <div className="flex items-center gap-3">
          <Avatar url={props.avatarUrl} name={props.handle ?? props.displayName ?? "?"} size="lg" />
          <div>
            <p className="eyebrow">You</p>
            <h1 className="glow-amber font-display text-4xl text-amber">
              {props.handle ? `@${props.handle}` : (props.displayName ?? "YOUR TASTE")}
            </h1>
          </div>
        </div>
      </header>

      {/* Taste card — ticket stub */}
      <div className="ticket-edge relative overflow-hidden rounded bg-surface p-5">
        <div className="film-strip absolute inset-x-0 top-0" />
        <div className="mt-2 flex items-baseline justify-between">
          <p className="eyebrow">Admit One · Taste Profile №{String(props.version).padStart(3, "0")}</p>
          <span className="glow-ticket font-mono text-[0.6rem] tracking-widest text-ticket">
            <span className="blink">●</span> NOW SHOWING
          </span>
        </div>
        {props.threads.length === 0 ? (
          <p className="mt-3 text-sm text-dim">
            No profile yet — pick some films you love on the Tonight tab.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {props.threads.map((t, i) => (
              <li key={t.title}>
                <p className="font-mono text-xs uppercase tracking-widest text-ticket">
                  {String(i + 1).padStart(2, "0")} · {t.title}
                </p>
                <p className="mt-0.5 text-sm text-cream">{t.line}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex gap-2">
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
            {refreshing ? "…" : "Refresh"}
          </button>
        </div>
        {msg && <p className="mt-2 font-mono text-xs text-ticket">{msg}</p>}
      </div>

      <RankUp rankTitle={props.stats.rank.title} glyph={props.stats.rank.glyph} />
      <StreakBadge streak={props.streak} />
      <ProjectionistCard stats={props.stats} isMe />

      {/* Section tabs */}
      <div className="flex gap-1 rounded border border-line bg-surface p-1">
        {(["watchlist", "loved", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`flex-1 rounded px-2 py-2 font-mono text-[0.65rem] uppercase tracking-wider ${
              tab === t ? "bg-bg text-amber" : "text-dim"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "watchlist" && (
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
      )}

      {tab === "loved" && <LovedSection loved={props.loved} onChanged={() => router.refresh()} />}

      {tab === "history" && (
        <div>
          {props.history.length === 0 && (
            <p className="text-center text-sm text-dim">No watches logged yet.</p>
          )}
          <ShowMore initial={15} step={30} wrapperClassName="flex flex-col gap-2" label="Roll more watches">
          {props.history.map((h) =>
            h.movies ? (
              <div key={h.id} className="flex items-center gap-3 rounded border border-line bg-surface p-2">
                <div className="w-10 shrink-0">
                  <Poster
                    posterPath={h.movies.poster_path}
                    title={h.movies.title}
                    genres={h.movies.genres}
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm text-cream">
                    {h.movies.title}{" "}
                    <span className="font-mono text-xs text-dim">{h.movies.year ?? ""}</span>
                  </p>
                  <p className="font-mono text-[0.65rem] uppercase tracking-wider text-amber">
                    {h.reaction.replaceAll("_", " ")}
                    {h.why ? ` · ${h.why}` : ""}
                  </p>
                  {h.note && <p className="truncate text-xs italic text-dim">“{h.note}”</p>}
                </div>
              </div>
            ) : null,
          )}
          </ShowMore>
        </div>
      )}

    </section>
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
        Add or ✕ remove films, then hit <span className="text-amber">Refresh</span> up top to
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
