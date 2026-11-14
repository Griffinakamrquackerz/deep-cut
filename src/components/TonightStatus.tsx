"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Poster from "@/components/Poster";
import type { TonightCard } from "@/lib/tonight";
import { toast } from "@/lib/toast";

// "What I'm watching tonight" — a plan, on a profile.
//
// Setting one puts a line on your card and a card in the Lobby for anyone
// following you. It pings nobody, which is the point: it's a note on a door,
// not a phone call. It goes stale on its own after eighteen hours, so a plan is
// still there over breakfast and gone before the next evening starts.
//
// The same component draws someone else's — read-only, and absent entirely when
// they haven't said. An empty prompt on a stranger's page is furniture asking a
// question nobody can answer.

interface Film {
  id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  genres?: string[];
}

export default function TonightStatus({
  initial,
  editable,
  name,
}: {
  initial: TonightCard | null;
  editable: boolean;
  /** Whose plan this is, for the read-only heading. */
  name?: string;
}) {
  const [plan, setPlan] = useState<TonightCard | null>(initial);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Film[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    const data = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setResults(((data?.results ?? []) as Film[]).slice(0, 6));
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void search(q), 220);
    return () => clearTimeout(t);
  }, [q, open, search]);

  async function set(f: Film) {
    setBusy(true);
    const res = await fetch("/api/tonight", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movieId: f.id, note: note.trim() || undefined }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => null) : null;
      toast(d?.note ?? "Couldn't set that.", { tone: "amber", icon: "✕" });
      return;
    }
    const d = await res.json();
    setPlan({
      movieId: f.id,
      title: f.title,
      year: f.year,
      posterPath: f.poster_path,
      genres: f.genres ?? [],
      note: note.trim() || null,
      expiresAt: d.plan?.expiresAt ?? "",
    });
    setOpen(false);
    setQ("");
    setResults(null);
    toast("On your card and in the Lobby.", { tone: "ticket", icon: "🍿" });
  }

  async function clear() {
    setBusy(true);
    await fetch("/api/tonight", { method: "DELETE" }).catch(() => null);
    setBusy(false);
    setPlan(null);
    setNote("");
  }

  // Somebody else's page, and they haven't said. Draw nothing.
  if (!editable && !plan) return null;

  return (
    <div className="rounded border border-line bg-surface p-3">
      <p className="eyebrow">Tonight</p>

      {plan ? (
        <div className="mt-1.5 flex items-center gap-3">
          <Link href={`/m/${plan.movieId}`} className="wiggle w-12 shrink-0">
            <Poster
              posterPath={plan.posterPath}
              title={plan.title}
              year={plan.year}
              genres={plan.genres}
            />
          </Link>
          <p className="min-w-0 flex-1 text-sm text-cream">
            {editable ? "Watching" : `${name ?? "They"} is watching`}{" "}
            <Link
              href={`/m/${plan.movieId}`}
              className="font-medium text-amber hover:underline"
            >
              {plan.title}
            </Link>
            {plan.year ? <span className="text-dim"> ({plan.year})</span> : null}
            {plan.note ? <span className="text-dim"> — {plan.note}</span> : null}
          </p>
          {editable && (
            <button
              onClick={() => void clear()}
              disabled={busy}
              className="shrink-0 font-mono text-[0.55rem] uppercase tracking-widest text-dim underline disabled:opacity-40"
            >
              clear
            </button>
          )}
        </div>
      ) : !open ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-1.5 text-left text-sm text-dim hover:text-cream"
        >
          What are you watching tonight?
        </button>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 140))}
            placeholder="Finally. / For the fourth time. (optional)"
            className="rounded border border-line bg-bg px-2.5 py-1.5 text-sm text-cream placeholder:text-dim/60"
          />
          <input
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
            placeholder="Which film?"
            className="rounded border border-line bg-bg px-2.5 py-1.5 text-sm text-cream placeholder:text-dim/60"
          />
          {results?.length ? (
            <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {results.map((f) => (
                <li key={f.id}>
                  <button
                    onClick={() => void set(f)}
                    disabled={busy}
                    className="flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left disabled:opacity-50"
                  >
                    <span className="w-8 shrink-0">
                      <Poster posterPath={f.poster_path} title={f.title} year={f.year} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-cream">
                      {f.title}
                      {f.year ? <span className="text-dim"> ({f.year})</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : q.trim() ? (
            <p className="font-mono text-[0.6rem] text-dim">nothing by that name.</p>
          ) : null}
          <button
            onClick={() => setOpen(false)}
            className="self-start font-mono text-[0.55rem] uppercase tracking-widest text-dim underline"
          >
            cancel
          </button>
        </div>
      )}
    </div>
  );
}
