"use client";
import { useState } from "react";
import Link from "next/link";
import Poster from "./Poster";
import { playlistProgress } from "@/lib/slug";
import Confetti from "./Confetti";
import { sfxPop } from "@/lib/sfx";

const REACTIONS = [
  { value: "loved", label: "♥ loved" },
  { value: "fine", label: "— fine" },
  { value: "not_for_me", label: "✕ not for me" },
  { value: "loved_ironically", label: "🃏 ironically" },
] as const;

export interface PlaylistItemView {
  id: string;
  crossed_off: boolean;
  reaction: string | null;
  note: string | null;
  position: number;
  movies: {
    id: number;
    title: string;
    year: number | null;
    poster_path: string | null;
    genres: string[];
    runtime: number | null;
  } | null;
}

export default function PlaylistDetail({
  playlistId,
  name,
  ownerName,
  recipientName,
  slug,
  items: initialItems,
  viewerIsOwner,
  viewerLoggedIn,
  isPublic: initialPublic = true,
}: {
  playlistId?: string;
  name: string;
  ownerName: string;
  recipientName: string | null;
  slug: string;
  items: PlaylistItemView[];
  viewerIsOwner: boolean;
  viewerLoggedIn: boolean;
  isPublic?: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [confetti, setConfetti] = useState(0);
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [visSaving, setVisSaving] = useState(false);
  const { done, total, pct } = playlistProgress(items);

  async function toggleVisibility() {
    if (!playlistId || visSaving) return;
    const next = !isPublic;
    setIsPublic(next); // optimistic
    setVisSaving(true);
    const res = await fetch("/api/playlists/visibility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlistId, isPublic: next }),
    });
    if (!res.ok) setIsPublic(!next); // revert on failure
    setVisSaving(false);
  }

  async function update(itemId: string, patch: Record<string, unknown>) {
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...normalize(patch) } : i)));
    await fetch(`/api/playlists/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...patch, slug }),
    });
  }

  function normalize(patch: Record<string, unknown>): Partial<PlaylistItemView> {
    const out: Partial<PlaylistItemView> = {};
    if ("crossedOff" in patch) out.crossed_off = Boolean(patch.crossedOff);
    if ("reaction" in patch) out.reaction = patch.reaction as string | null;
    if ("note" in patch) out.note = patch.note as string | null;
    return out;
  }

  function requireLogin(): boolean {
    if (viewerLoggedIn) return false;
    window.location.href = `/login`;
    return true;
  }

  return (
    <section className="flex flex-col gap-4 px-4 py-8">
      <Confetti trigger={confetti} />
      <header>
        <p className="eyebrow">
          A mixtape from {ownerName}
          {recipientName ? ` · for ${recipientName}` : ""}
        </p>
        <h1 className="glow-amber font-display text-4xl text-amber">{name.toUpperCase()}</h1>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface">
          <div className="h-full rounded-full bg-avail" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 font-mono text-[0.65rem] text-dim">
          {done}/{total} crossed off
        </p>
      </header>

      <ul className="flex flex-col gap-3">
        {items
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((item) => {
            const m = item.movies;
            if (!m) return null;
            return (
              <li
                key={item.id}
                className={`flex gap-3 rounded border border-line bg-surface p-3 ${
                  item.crossed_off ? "opacity-60" : ""
                }`}
              >
                <div className="w-16 shrink-0">
                  <Poster
                    posterPath={m.poster_path}
                    title={m.title}
                    year={m.year}
                    genres={m.genres}
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={item.crossed_off}
                      onChange={(e) => {
                        if (requireLogin()) return;
                        if (e.target.checked) {
                          sfxPop();
                          // last film crossed off → the whole tape is done
                          const remaining = items.filter((x) => !x.crossed_off).length;
                          if (remaining === 1) setConfetti((c) => c + 1);
                        }
                        void update(item.id, { crossedOff: e.target.checked });
                      }}
                      className="mt-1 accent-avail"
                      aria-label={`Cross off ${m.title}`}
                    />
                    <span
                      className={`font-display text-lg leading-tight text-cream ${
                        item.crossed_off ? "line-through decoration-ticket" : ""
                      }`}
                    >
                      {m.title}{" "}
                      <span className="font-mono text-xs text-dim">{m.year ?? ""}</span>
                    </span>
                  </label>

                  {m.genres.length > 0 && (
                    <p className="font-mono text-[0.55rem] uppercase tracking-wider text-amber/70">
                      {m.genres.slice(0, 3).join(" · ")}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {REACTIONS.map((r) => (
                      <button
                        key={r.value}
                        onClick={() => {
                          if (requireLogin()) return;
                          void update(item.id, {
                            reaction: item.reaction === r.value ? null : r.value,
                          });
                        }}
                        aria-pressed={item.reaction === r.value}
                        className={`rounded-full border px-2 py-1 font-mono text-[0.6rem] uppercase tracking-wider ${
                          item.reaction === r.value
                            ? "border-amber text-amber"
                            : "border-line text-dim"
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>

                  {item.note && !(item.id in noteDraft) ? (
                    <button
                      onClick={() => setNoteDraft((d) => ({ ...d, [item.id]: item.note ?? "" }))}
                      className="text-left text-xs italic text-dim"
                    >
                      “{item.note}”
                    </button>
                  ) : (
                    <div className="flex gap-1.5">
                      <input
                        value={noteDraft[item.id] ?? ""}
                        onChange={(e) =>
                          setNoteDraft((d) => ({ ...d, [item.id]: e.target.value.slice(0, 300) }))
                        }
                        placeholder="Leave a note…"
                        className="min-w-0 flex-1 rounded border border-line bg-bg px-2 py-1 text-xs text-cream placeholder:text-dim/60"
                      />
                      <button
                        onClick={() => {
                          if (requireLogin()) return;
                          const note = (noteDraft[item.id] ?? "").trim() || null;
                          void update(item.id, { note });
                          setNoteDraft((d) => {
                            const { [item.id]: _drop, ...rest } = d;
                            return rest;
                          });
                        }}
                        className="rounded border border-line px-2 py-1 font-mono text-[0.6rem] uppercase text-dim"
                      >
                        Save
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
      </ul>

      {!viewerLoggedIn && (
        <Link
          href="/login"
          className="rounded bg-amber px-4 py-3 text-center font-mono text-xs font-medium uppercase tracking-widest text-bg"
        >
          Sign up to cross films off — and get your own taste profile
        </Link>
      )}
      {viewerIsOwner && (
        <div className="flex flex-col gap-2 border-t border-dashed border-line pt-4">
          {playlistId && (
            <button
              onClick={() => void toggleVisibility()}
              disabled={visSaving}
              aria-pressed={!isPublic}
              className="flex items-center justify-between rounded border border-line bg-surface px-3 py-3 disabled:opacity-60"
            >
              <span className="text-left">
                <span className="block font-mono text-xs uppercase tracking-wider text-cream">
                  {isPublic ? "🌐 Public mixtape" : "🔒 Private mixtape"}
                </span>
                <span className="font-mono text-[0.6rem] text-dim">
                  {isPublic
                    ? "on your profile & anyone with the link can open it"
                    : "only you can see this — hidden from your profile & the link"}
                </span>
              </span>
              <span
                className={`rounded-full border px-3 py-1 font-mono text-[0.65rem] uppercase tracking-widest ${
                  isPublic ? "border-avail text-avail" : "border-line text-dim"
                }`}
              >
                {visSaving ? "…" : isPublic ? "Public" : "Private"}
              </span>
            </button>
          )}
          <p className="text-center font-mono text-[0.65rem] text-dim">
            You made this tape. Reactions and notes above are your recipient&apos;s.
          </p>
        </div>
      )}
    </section>
  );
}
