"use client";
import { useCallback, useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import { fetchPeople, type Person } from "@/lib/people";
import { askAndSubscribe, pushSupported } from "@/lib/push-client";
import { toast } from "@/lib/toast";

// Two ways to pass a film on.
//
// Out: the share sheet, to anyone, over whatever app they use. Film pages are
// public and crawlable, so the link works for somebody who has never heard of
// Deep Cut — they get the film, the ratings and a way in, rather than a login
// wall, which is the difference between a share and a dead end.
//
// In: hand it to somebody who's already here. It lands in their inbox rather
// than anywhere public — this is passing someone a tape, not posting about it.

export default function ShareFilm({
  movieId,
  title,
  signedIn,
}: {
  movieId: number;
  title: string;
  signedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  // Offered after a successful send: you have just used the thing that
  // notifications are for, so the ask explains itself. Shown at most once per
  // mount, and never when the browser has already decided either way.
  const [offerPush, setOfferPush] = useState(false);

  const url = typeof window !== "undefined" ? `${window.location.origin}/m/${movieId}` : "";

  async function shareOut() {
    const text = `${title} — on Deep Cut`;
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title, text, url }).catch(() => null);
      return;
    }
    await navigator.clipboard?.writeText(url).catch(() => null);
    toast("Link copied.", { tone: "ticket", icon: "🔗" });
  }

  const load = useCallback(async (query: string) => {
    setPeople((await fetchPeople(query)).slice(0, 12));
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void load(q.trim()), 160);
    return () => clearTimeout(t);
  }, [open, q, load]);

  async function send(p: Person) {
    setSending(p.id);
    const res = await fetch("/api/share/film", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId: p.id, movieId, note: note.trim() || undefined }),
    }).catch(() => null);
    setSending(null);
    if (!res?.ok) {
      const err = res ? ((await res.json().catch(() => null))?.error as string | undefined) : undefined;
      toast(
        err === "rate_limited"
          ? "That's a lot of films for one day. Try again tomorrow."
          : err === "unavailable"
            ? "Can't send to them."
            : "Didn't go through — nothing was sent.",
        { tone: "amber", icon: "✕" },
      );
      return;
    }
    setSent((s) => new Set(s).add(p.id));
    toast(`Sent to ${p.handle ? `@${p.handle}` : (p.display_name ?? "them")}.`, {
      tone: "ticket",
      icon: "🎞",
    });
    if (pushSupported() && Notification.permission === "default") setOfferPush(true);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void shareOut()}
          className="flex-1 rounded border border-line px-3 py-2 font-mono text-[0.65rem] uppercase tracking-widest text-cream"
        >
          ↗ Share
        </button>
        {signedIn && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex-1 rounded border border-line px-3 py-2 font-mono text-[0.65rem] uppercase tracking-widest text-cream"
          >
            🎞 Send to…
          </button>
        )}
      </div>

      {offerPush && (
        <div className="flex items-center gap-2 rounded border border-amber/40 bg-amber/5 p-2.5">
          <p className="min-w-0 flex-1 text-[0.8rem] text-cream">
            Want to know when they send one back?
          </p>
          <button
            type="button"
            onClick={() => void askAndSubscribe().then(() => setOfferPush(false))}
            className="shrink-0 rounded bg-amber px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-widest text-bg"
          >
            Turn on
          </button>
          <button
            type="button"
            onClick={() => setOfferPush(false)}
            className="shrink-0 font-mono text-[0.55rem] uppercase tracking-widest text-dim underline"
          >
            No
          </button>
        </div>
      )}

      {open && (
        <div className="flex flex-col gap-2 rounded border border-line bg-surface p-3">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 140))}
            placeholder="Say something (optional)"
            className="rounded border border-line bg-bg px-2.5 py-1.5 text-sm text-cream placeholder:text-dim/60"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find someone…"
            className="rounded border border-line bg-bg px-2.5 py-1.5 text-sm text-cream placeholder:text-dim/60"
          />
          {people === null ? (
            <p className="font-mono text-[0.6rem] text-dim">looking…</p>
          ) : people.length === 0 ? (
            <p className="font-mono text-[0.6rem] text-dim">nobody by that name.</p>
          ) : (
            <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {people.map((p) => {
                const name = p.handle ? `@${p.handle}` : (p.display_name ?? "someone");
                const done = sent.has(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={done || sending === p.id}
                      onClick={() => void send(p)}
                      className="flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left disabled:opacity-50"
                    >
                      <Avatar url={p.avatar_url} name={name} size="sm" />
                      <span className="min-w-0 flex-1 truncate font-mono text-[0.7rem] text-cream">
                        {name}
                      </span>
                      <span className="font-mono text-[0.55rem] uppercase tracking-widest text-amber">
                        {done ? "sent" : sending === p.id ? "…" : "send"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
