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
          <li
            key={u.id}
            className="flex items-center justify-between gap-3 rounded border border-line bg-surface p-3"
          >
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
