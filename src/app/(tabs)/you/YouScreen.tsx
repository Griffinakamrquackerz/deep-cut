"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Poster from "@/components/Poster";
import ObscurityDots from "@/components/ObscurityDots";
import { SERVICES, SERVICE_LABELS, type Service } from "@/lib/services";
import MarqueeBulbs from "@/components/MarqueeBulbs";
import InstallPrompt from "@/components/InstallPrompt";
import ShowMore from "@/components/ShowMore";
import LetterboxdImport from "@/components/LetterboxdImport";
import { isMuted, setMuted, sfxChime } from "@/lib/sfx";

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
  const [tab, setTab] = useState<"watchlist" | "loved" | "history" | "settings">("watchlist");
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
      setMsg("Set a handle in Settings first — that's your marquee name.");
      setTab("settings");
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
        <div>
          <p className="eyebrow">You</p>
          <h1 className="glow-amber font-display text-4xl text-amber">
            {props.handle ? `@${props.handle}` : (props.displayName ?? "YOUR TASTE")}
          </h1>
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

      {/* Section tabs */}
      <div className="flex gap-1 rounded border border-line bg-surface p-1">
        {(["watchlist", "loved", "history", "settings"] as const).map((t) => (
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

      {tab === "settings" && (
        <SettingsSection
          handle={props.handle}
          services={props.services}
          onChanged={() => router.refresh()}
        />
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

function SettingsSection({
  handle,
  services,
  onChanged,
}: {
  handle: string | null;
  services: Service[];
  onChanged: () => void;
}) {
  const [newHandle, setNewHandle] = useState(handle ?? "");
  const [selected, setSelected] = useState<Set<Service>>(new Set(services));
  const [status, setStatus] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [pwStatus, setPwStatus] = useState<string | null>(null);
  const [muted, setMutedState] = useState(true);
  useEffect(() => setMutedState(isMuted()), []);

  function toggleSound() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) sfxChime(); // a little fanfare so they hear it working
  }

  async function savePassword() {
    setPwStatus(null);
    const { supabaseBrowser } = await import("@/lib/supabase/client");
    const { error } = await supabaseBrowser().auth.updateUser({ password: newPassword });
    if (error) setPwStatus(error.message);
    else {
      setPwStatus("Password set — you can now sign in without email links.");
      setNewPassword("");
    }
  }

  async function save() {
    setStatus(null);
    const [meRes, svcRes] = await Promise.all([
      newHandle && newHandle !== handle
        ? fetch("/api/me", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ handle: newHandle }),
          })
        : Promise.resolve(new Response(null, { status: 200 })),
      fetch("/api/services", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services: [...selected] }),
      }),
    ]);
    if (meRes.status === 409) setStatus("That handle is taken.");
    else if (!meRes.ok || !svcRes.ok) setStatus("Save failed.");
    else {
      setStatus("Saved.");
      onChanged();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Handle</span>
        <input
          value={newHandle}
          onChange={(e) => setNewHandle(e.target.value)}
          placeholder="your_handle"
          className="rounded border border-line bg-surface px-3 py-2.5 text-cream placeholder:text-dim/60"
        />
      </label>
      <div>
        <p className="eyebrow mb-2">Streaming services</p>
        <div className="grid grid-cols-2 gap-2">
          {SERVICES.map((s) => {
            const on = selected.has(s);
            return (
              <button
                key={s}
                onClick={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(s)) next.delete(s);
                    else next.add(s);
                    return next;
                  })
                }
                aria-pressed={on}
                className={`rounded border px-3 py-2.5 text-left font-mono text-xs uppercase tracking-wider ${
                  on ? "border-avail text-avail" : "border-line text-dim"
                }`}
              >
                {on ? "✓ " : ""}
                {SERVICE_LABELS[s]}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <p className="eyebrow mb-2">Projection booth</p>
        <button
          onClick={toggleSound}
          aria-pressed={!muted}
          className="flex w-full items-center justify-between rounded border border-line bg-surface px-3 py-3"
        >
          <span className="text-left">
            <span className="block font-mono text-xs uppercase tracking-wider text-cream">
              {muted ? "🔇" : "🔊"} House sound
            </span>
            <span className="font-mono text-[0.6rem] text-dim">
              clicks, chimes & confetti pops
            </span>
          </span>
          <span
            className={`rounded-full border px-3 py-1 font-mono text-[0.65rem] uppercase tracking-widest ${
              muted ? "border-line text-dim" : "border-avail text-avail"
            }`}
          >
            {muted ? "Off" : "On"}
          </span>
        </button>
      </div>

      <button
        onClick={save}
        className="rounded bg-amber px-4 py-3 font-mono text-xs font-medium uppercase tracking-widest text-bg"
      >
        Save settings
      </button>
      {status && <p className="font-mono text-xs text-dim">{status}</p>}

      <div className="mt-2 border-t border-line pt-4">
        <p className="eyebrow mb-2">Password</p>
        <p className="mb-2 text-xs text-dim">
          Set one and you&apos;ll never need an email link to sign in again.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            minLength={8}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (8+ chars)"
            className="min-w-0 flex-1 rounded border border-line bg-surface px-3 py-2.5 text-cream placeholder:text-dim/60"
          />
          <button
            disabled={newPassword.length < 8}
            onClick={() => void savePassword()}
            className="rounded border border-amber px-3 py-2.5 font-mono text-xs uppercase tracking-widest text-amber disabled:opacity-40"
          >
            Set
          </button>
        </div>
        {pwStatus && <p className="mt-2 font-mono text-xs text-dim">{pwStatus}</p>}
      </div>

      <div className="mt-2">
        <InstallPrompt compact />
      </div>
    </div>
  );
}
