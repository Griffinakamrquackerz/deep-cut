"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/toast";

// The Door — waitlist control for the velvet rope. Shows the line in order,
// lets you seat one person instantly (friends skip the line) or the next
// batch. The daily cron trickles WAITLIST_DAILY (default 25) on its own;
// everything here is manual override on top.

interface Entry {
  email: string;
  joinedAt: string;
}

/**
 * Seating has two halves — Supabase mints the sign-in link, Resend delivers it
 * — and which half broke is the whole diagnosis. "Check the logs" said neither.
 */
function inviteError(raw: string | undefined): string {
  const msg = (raw ?? "").trim();
  if (!msg) return "Invite failed, and the server didn't say why.";
  if (msg.startsWith("email_failed"))
    return `Account created, but Resend refused it — ${msg.replace(/^email_failed\s*—\s*/, "")}`;
  if (msg === "no_link_generated" || /AuthError/i.test(msg))
    return `Supabase wouldn't create a sign-in link: ${msg}`;
  return `Invite failed: ${msg}`;
}

function ago(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

export default function AdminDoor() {
  const [pending, setPending] = useState<Entry[] | null>(null);
  const [approved, setApproved] = useState<Entry[]>([]);
  const [approvedToday, setApprovedToday] = useState(0);
  const [busy, setBusy] = useState<string | null>(null); // email being seated, or "batch"

  const load = useCallback(async () => {
    const data = await fetch("/api/admin/waitlist")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setPending((data?.pending as Entry[]) ?? []);
    setApproved((data?.approved as Entry[]) ?? []);
    setApprovedToday(data?.approvedToday ?? 0);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function seat(email: string) {
    setBusy(email);
    const res = await fetch("/api/admin/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    if (res?.ok) {
      toast(`Seated ${email} — invite sent.`, { tone: "ticket", icon: "🎟" });
    } else {
      const note = res ? ((await res.json().catch(() => null))?.error as string | undefined) : undefined;
      toast(inviteError(note), { tone: "amber", icon: "✕" });
    }
    await load();
    setBusy(null);
  }

  async function seatNext(n: number) {
    setBusy("batch");
    const res = await fetch("/api/admin/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ next: n }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    const count = data?.approved?.length ?? 0;
    const failed = (data?.failed ?? []) as Array<{ email: string; note?: string }>;
    if (failed.length > 0) {
      toast(`${count} seated, ${failed.length} failed — ${inviteError(failed[0]?.note)}`, {
        tone: "amber",
        icon: "✕",
      });
    } else {
      toast(count > 0 ? `Seated the next ${count}.` : "Nobody in line to seat.", {
        tone: "ticket",
        icon: "🎟",
      });
    }
    await load();
    setBusy(null);
  }

  if (pending === null) {
    return <p className="font-mono text-xs text-dim">Checking the line…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Door stats */}
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { n: pending.length, l: "in line" },
          { n: approvedToday, l: "seated today" },
          { n: approved.length, l: "seated all-time" },
        ].map((s) => (
          <div key={s.l} className="rounded border border-line bg-surface p-3">
            <p className="font-display text-3xl text-amber">{s.n}</p>
            <p className="font-mono text-[0.6rem] uppercase tracking-widest text-dim">{s.l}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[0.6rem] uppercase tracking-widest text-dim">
          The trickle seats 25/day on its own (5pm UTC) · WAITLIST_DAILY to tune, 0 to pause
        </p>
        <button
          onClick={() => void seatNext(10)}
          disabled={busy !== null || pending.length === 0}
          className="shrink-0 rounded bg-amber px-3 py-2 font-mono text-[0.65rem] font-medium uppercase tracking-widest text-bg disabled:opacity-40"
        >
          {busy === "batch" ? "Seating…" : "Seat next 10"}
        </button>
      </div>

      {/* The line, in order */}
      {pending.length === 0 ? (
        <p className="rounded border border-dashed border-line p-4 text-center font-mono text-xs text-dim">
          Nobody in line. Post the link — the lobby won&apos;t fill itself.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {pending.map((e, i) => (
            <li
              key={e.email}
              className="flex items-center gap-3 rounded border border-line bg-surface px-3 py-2"
            >
              <span className="w-10 shrink-0 font-display text-lg text-ticket">#{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-cream">{e.email}</span>
              <span className="shrink-0 font-mono text-[0.6rem] text-dim">{ago(e.joinedAt)}</span>
              <button
                onClick={() => void seat(e.email)}
                disabled={busy !== null}
                className="shrink-0 rounded border border-amber px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-widest text-amber disabled:opacity-40"
              >
                {busy === e.email ? "…" : "Seat"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Recently seated */}
      {approved.length > 0 && (
        <div>
          <p className="eyebrow mb-1.5">Recently seated</p>
          <ul className="flex flex-col gap-1">
            {approved.slice(0, 10).map((e) => (
              <li key={e.email} className="flex justify-between font-mono text-[0.65rem] text-dim">
                <span className="truncate">{e.email}</span>
                <span className="shrink-0">🎟</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
