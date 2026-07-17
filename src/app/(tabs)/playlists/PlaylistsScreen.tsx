"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { playlistProgress } from "@/lib/slug";

interface PlaylistRow {
  id: string;
  name: string;
  recipient_name?: string | null;
  share_slug: string;
  created_at: string;
  playlist_items: Array<{ crossed_off: boolean }>;
}

interface PoolFilm {
  id: number;
  title: string;
  year: number | null;
}

function ProgressBar({ items }: { items: Array<{ crossed_off: boolean }> }) {
  const { done, total, pct } = playlistProgress(items);
  return (
    <div className="mt-1.5">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg">
        <div className="h-full rounded-full bg-avail" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 font-mono text-[0.6rem] text-dim">
        {done}/{total} crossed off
      </p>
    </div>
  );
}

export default function PlaylistsScreen({
  sent,
  received,
  pickPool,
}: {
  sent: PlaylistRow[];
  received: PlaylistRow[];
  pickPool: PoolFilm[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [recipient, setRecipient] = useState("");
  const [picks, setPicks] = useState<Map<number, PoolFilm>>(new Map());
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PoolFilm[]>([]);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function search(q: string) {
    setQuery(q);
    if (!q.trim()) return setResults([]);
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    if (res.ok) setResults(((await res.json()).results ?? []).slice(0, 6));
  }

  function toggle(f: PoolFilm) {
    setPicks((prev) => {
      const next = new Map(prev);
      if (next.has(f.id)) next.delete(f.id);
      else if (next.size < 30) next.set(f.id, f);
      return next;
    });
  }

  async function create() {
    setBusy(true);
    const res = await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        recipientName: recipient.trim() || null,
        movieIds: [...picks.keys()],
      }),
    });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      setShareLink(`${window.location.origin}/p/${data.shareSlug}`);
      router.refresh();
    }
  }

  async function copyLink() {
    if (!shareLink) return;
    await navigator.clipboard.writeText(shareLink).catch(() => null);
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "playlist_shared", props: {} }),
    });
  }

  if (shareLink) {
    return (
      <section className="flex flex-col gap-4">
        <p className="eyebrow">Mixtape sealed</p>
        <h1 className="glow-amber font-display text-4xl text-amber">SEND IT</h1>
        <div className="ticket-edge rounded bg-surface p-4">
          <p className="break-all font-mono text-xs text-amber">{shareLink}</p>
        </div>
        <button
          onClick={copyLink}
          className="rounded bg-amber px-4 py-3 font-mono text-xs font-medium uppercase tracking-widest text-bg"
        >
          Copy link
        </button>
        <button
          onClick={() => {
            setShareLink(null);
            setCreating(false);
            setPicks(new Map());
            setName("");
            setRecipient("");
          }}
          className="rounded border border-line px-4 py-3 font-mono text-xs uppercase tracking-widest text-dim"
        >
          Done
        </button>
      </section>
    );
  }

  if (creating) {
    const count = picks.size;
    return (
      <section className="flex flex-col gap-4">
        <p className="eyebrow">New mixtape</p>
        <h1 className="glow-amber font-display text-4xl text-amber">MAKE A PLAYLIST</h1>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 80))}
          placeholder="Name it — “movies to fix your October”"
          className="rounded border border-line bg-surface px-3 py-2.5 text-cream placeholder:text-dim/60"
        />
        <input
          value={recipient}
          onChange={(e) => setRecipient(e.target.value.slice(0, 60))}
          placeholder="For… (optional)"
          className="rounded border border-line bg-surface px-3 py-2.5 text-cream placeholder:text-dim/60"
        />

        <input
          type="search"
          value={query}
          onChange={(e) => void search(e.target.value)}
          placeholder="Search any film…"
          aria-label="Search films"
          className="rounded border border-line bg-surface px-3 py-2.5 text-cream placeholder:text-dim/60"
        />
        {results.length > 0 && (
          <ul className="divide-y divide-line rounded border border-line bg-surface">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => {
                    toggle(r);
                    setQuery("");
                    setResults([]);
                  }}
                  className="flex w-full justify-between px-3 py-2 text-left text-sm"
                >
                  <span>
                    {r.title} <span className="font-mono text-xs text-dim">{r.year ?? ""}</span>
                  </span>
                  <span className="text-amber">{picks.has(r.id) ? "✓" : "+"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {pickPool.length > 0 && (
          <>
            <p className="eyebrow">From your watchlist & loved films</p>
            <ul className="flex flex-wrap gap-2">
              {pickPool.map((f) => {
                const on = picks.has(f.id);
                return (
                  <li key={f.id}>
                    <button
                      onClick={() => toggle(f)}
                      aria-pressed={on}
                      className={`rounded-full border px-3 py-1.5 text-xs ${
                        on ? "border-amber text-amber" : "border-line text-cream"
                      }`}
                    >
                      {f.title} {f.year ? `(${f.year})` : ""}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {count > 0 && (
          <p className="font-mono text-xs text-dim">
            {count} film{count === 1 ? "" : "s"} on the tape
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => setCreating(false)}
            className="rounded border border-line px-4 py-3 font-mono text-xs uppercase tracking-widest text-dim"
          >
            Cancel
          </button>
          <button
            disabled={!name.trim() || count === 0 || busy}
            onClick={create}
            className="flex-1 rounded bg-amber px-4 py-3 font-mono text-xs font-medium uppercase tracking-widest text-bg disabled:opacity-40"
          >
            {busy ? "Sealing…" : "Create & get link"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Playlists</p>
          <h1 className="glow-amber font-display text-4xl text-amber">MOVIE MIXTAPES</h1>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="rounded bg-ticket px-3 py-2 font-mono text-xs font-medium uppercase tracking-widest text-cream"
        >
          + New
        </button>
      </header>

      <div>
        <p className="eyebrow mb-2">Sent</p>
        {sent.length === 0 ? (
          <p className="text-sm text-dim">
            No mixtapes yet. Every playlist you send is a friend you recruit.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sent.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/playlists/${p.id}`}
                  className="block rounded border border-line bg-surface p-3"
                >
                  <div className="flex justify-between">
                    <span className="font-display text-lg text-cream">{p.name}</span>
                    {p.recipient_name && (
                      <span className="font-mono text-[0.65rem] text-dim">
                        for {p.recipient_name}
                      </span>
                    )}
                  </div>
                  <ProgressBar items={p.playlist_items} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="eyebrow mb-2">Received</p>
        {received.length === 0 ? (
          <p className="text-sm text-dim">Nothing in the mailbox yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {received.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/p/${p.share_slug}`}
                  className="block rounded border border-line bg-surface p-3"
                >
                  <span className="font-display text-lg text-cream">{p.name}</span>
                  <ProgressBar items={p.playlist_items} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
