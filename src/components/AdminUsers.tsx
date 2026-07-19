"use client";
import { useMemo, useState } from "react";

export interface AdminUserRow {
  id: string;
  email: string | null;
  handle: string | null;
  displayName: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  isSelf: boolean;
}

function fmt(d: string | null): string {
  if (!d) return "—";
  const t = new Date(d);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

interface PeekData {
  watchlist: Array<{
    movieId: number;
    title: string;
    year: number | null;
    posterPath: string | null;
    reason: string;
    obscurity: number;
  }>;
  counts: { watchlist: number; loved: number; watches: number };
}

export default function AdminUsers({
  users: initial,
  adminEmail,
}: {
  users: AdminUserRow[];
  adminEmail: string;
}) {
  const [users, setUsers] = useState(initial);
  const [q, setQ] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [peekId, setPeekId] = useState<string | null>(null);
  const [peek, setPeek] = useState<PeekData | null>(null);
  const [peekLoading, setPeekLoading] = useState(false);

  async function togglePeek(userId: string) {
    if (peekId === userId) {
      setPeekId(null);
      setPeek(null);
      return;
    }
    setPeekId(userId);
    setPeek(null);
    setPeekLoading(true);
    const data = await fetch(`/api/admin/user-detail?id=${userId}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setPeek(data);
    setPeekLoading(false);
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return users;
    return users.filter((u) =>
      [u.email, u.handle, u.displayName, u.id].some((v) => v?.toLowerCase().includes(s)),
    );
  }, [users, q]);

  async function del(u: AdminUserRow) {
    setBusyId(u.id);
    setMsg(null);
    const res = await fetch("/api/admin/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: u.id }),
    });
    setBusyId(null);
    setConfirmId(null);
    if (res.ok) {
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setMsg(`Deleted ${u.email ?? u.handle ?? u.id}.`);
    } else {
      const body = await res.json().catch(() => ({}));
      setMsg(`Delete failed: ${body.error ?? res.status}`);
    }
  }

  return (
    <section className="flex flex-col gap-4 px-4 py-8">
      <header>
        <p className="eyebrow">Admin console</p>
        <h1 className="glow-amber font-display text-4xl text-amber">THE PROJECTION BOOTH</h1>
        <p className="mt-1 font-mono text-[0.65rem] text-dim">
          Signed in as {adminEmail} · {users.length} account{users.length === 1 ? "" : "s"}
        </p>
      </header>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by email, handle, or id…"
        className="rounded border border-line bg-surface px-3 py-2.5 text-cream placeholder:text-dim/60"
      />

      {msg && <p className="font-mono text-xs text-ticket">{msg}</p>}

      <ul className="flex flex-col gap-2">
        {filtered.map((u) => (
          <li key={u.id} className="flex flex-col rounded border border-line bg-surface p-3">
            <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-cream">
                {u.email ?? "—"}
                {u.isSelf && (
                  <span className="ml-2 rounded-sm border border-amber px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-widest text-amber">
                    you
                  </span>
                )}
              </p>
              <p className="truncate font-mono text-[0.6rem] text-dim">
                {u.handle ? `@${u.handle}` : "no handle"}
                {u.displayName ? ` · ${u.displayName}` : ""} · joined {fmt(u.createdAt)} · last in{" "}
                {fmt(u.lastSignInAt)}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => void togglePeek(u.id)}
              aria-expanded={peekId === u.id}
              className={`rounded border px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-widest ${
                peekId === u.id ? "border-amber text-amber" : "border-line text-dim hover:border-amber hover:text-amber"
              }`}
            >
              👁 {peekId === u.id ? "Close" : "Peek"}
            </button>
            {u.isSelf ? (
              <span className="shrink-0 font-mono text-[0.55rem] uppercase tracking-widest text-dim/60">
                Settings ↗
              </span>
            ) : confirmId === u.id ? (
              <div className="flex shrink-0 gap-1.5">
                <button
                  onClick={() => void del(u)}
                  disabled={busyId === u.id}
                  className="rounded border border-ticket bg-ticket/15 px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-widest text-ticket disabled:opacity-60"
                >
                  {busyId === u.id ? "…" : "Confirm"}
                </button>
                <button
                  onClick={() => setConfirmId(null)}
                  className="rounded border border-line px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-widest text-dim"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmId(u.id)}
                className="shrink-0 rounded border border-line px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-widest text-dim hover:border-ticket hover:text-ticket"
              >
                Delete
              </button>
            )}
            </div>
            </div>

            {/* God-mode peek: their watchlist, admin eyes only */}
            {peekId === u.id && (
              <div className="mt-3 border-t border-dashed border-line pt-3">
                {peekLoading ? (
                  <p className="font-mono text-[0.65rem] text-dim">Pulling the reel…</p>
                ) : !peek ? (
                  <p className="font-mono text-[0.65rem] text-ticket">Couldn&apos;t load — try again.</p>
                ) : (
                  <>
                    <p className="mb-2 font-mono text-[0.6rem] uppercase tracking-widest text-dim">
                      🎬 watchlist {peek.counts.watchlist} · loved {peek.counts.loved} · watches{" "}
                      {peek.counts.watches}
                    </p>
                    {peek.watchlist.length === 0 ? (
                      <p className="text-sm text-dim">Empty watchlist — nothing saved yet.</p>
                    ) : (
                      <ul className="flex flex-col gap-1.5">
                        {peek.watchlist.map((w) => (
                          <li key={w.movieId} className="flex items-center gap-2.5">
                            {w.posterPath ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={`https://image.tmdb.org/t/p/w92${w.posterPath}`}
                                alt=""
                                className="h-12 w-8 shrink-0 rounded object-cover"
                              />
                            ) : (
                              <span className="h-12 w-8 shrink-0 rounded bg-bg" />
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-sm text-cream">
                                {w.title}{" "}
                                <span className="font-mono text-xs text-dim">{w.year ?? ""}</span>{" "}
                                <span className="text-amber">{"◆".repeat(w.obscurity)}</span>
                              </p>
                              <p className="truncate font-mono text-[0.6rem] italic text-dim">
                                {w.reason}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="text-center text-sm text-dim">No accounts match.</li>
        )}
      </ul>

      <p className="mt-2 font-mono text-[0.6rem] text-dim">
        Deleting an account is permanent — it removes their auth login and cascades to every row
        they own (loved films, watches, recs, playlists, follows, profile).
      </p>
    </section>
  );
}
