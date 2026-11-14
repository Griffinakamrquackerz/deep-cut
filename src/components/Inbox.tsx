"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import PushGate from "@/components/PushGate";

// The inbox — things that happened to you, and things you sent.
//
// In: somebody tagged you in a comment, or handed you a film.
//
// Sent: what you passed on, and whether they've opened it. A send used to
// leave the sender with a toast and nothing else — the row belongs to the
// recipient, so there was no record on your side that you'd done it at all.
// "Delivered" here means the row is in their inbox; "opened" means they've
// been to look.

interface Actor {
  id: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

interface Item {
  id: string;
  kind: "mention" | "film_sent";
  props: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
  actor: Actor | null;
}

interface Sent {
  id: string;
  movieId: number | null;
  title: string | null;
  note: string | null;
  seenAt: string | null;
  sentAt: string;
  to: Actor | null;
}

function ago(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

function who(a: Actor | null): string {
  if (!a) return "someone";
  return a.handle ? `@${a.handle}` : (a.displayName ?? "someone");
}

export default function Inbox() {
  const [box, setBox] = useState<"in" | "sent">("in");
  const [items, setItems] = useState<Item[] | null>(null);
  const [sent, setSent] = useState<Sent[] | null>(null);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    const data = await fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setItems((data?.items as Item[]) ?? []);
    setUnread(Number(data?.unread ?? 0));
  }, []);

  const loadSent = useCallback(async () => {
    const data = await fetch("/api/notifications?box=sent")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setSent((data?.sent as Sent[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Only fetched when you go looking, and re-fetched each time so a "delivered"
  // that has since been opened doesn't sit there stale.
  useEffect(() => {
    if (box === "sent") void loadSent();
  }, [box, loadSent]);

  // Opening the inbox is reading it. The rows keep their unread tint for this
  // render so you can still see what was new — the badge is what clears.
  useEffect(() => {
    if (!unread) return;
    void fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => null);
  }, [unread]);

  const switcher = (
    <>
      <PushGate ask />
    <div className="mb-2 flex gap-1.5">
      {(
        [
          { key: "in", label: "In" },
          { key: "sent", label: "Sent" },
        ] as const
      ).map((t) => (
        <button
          key={t.key}
          onClick={() => setBox(t.key)}
          aria-pressed={box === t.key}
          className={`rounded-full border px-3 py-1 font-mono text-[0.6rem] uppercase tracking-wider ${
            box === t.key ? "border-amber text-amber" : "border-line text-dim"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
    </>
  );

  if (box === "sent") {
    return (
      <div>
        {switcher}
        {sent === null ? (
          <p className="font-mono text-xs text-dim">checking the outgoing tray…</p>
        ) : !sent.length ? (
          <p className="rounded border border-dashed border-line p-4 text-center text-sm text-dim">
            You haven&apos;t sent anyone a film yet. Hit 🎞 Send to… on any film.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sent.map((s) => (
              <li
                key={s.id}
                className="flex items-start gap-2.5 rounded border border-line bg-surface p-3"
              >
                <Avatar url={s.to?.avatarUrl ?? null} name={who(s.to)} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-cream">
                    You sent{" "}
                    {s.movieId ? (
                      <Link href={`/m/${s.movieId}`} className="font-medium text-amber hover:underline">
                        {s.title ?? "a film"}
                      </Link>
                    ) : (
                      <span className="font-medium text-amber">{s.title ?? "a film"}</span>
                    )}{" "}
                    to <span className="font-medium text-amber">{who(s.to)}</span>
                  </p>
                  {s.note && <p className="mt-0.5 truncate text-[0.8rem] text-dim">“{s.note}”</p>}
                  <p className="mt-0.5 font-mono text-[0.55rem] uppercase tracking-widest text-dim">
                    {ago(s.sentAt)} ago ·{" "}
                    <span className={s.seenAt ? "text-avail" : "text-dim"}>
                      {s.seenAt ? "opened" : "delivered"}
                    </span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (items === null) {
    return (
      <div>
        {switcher}
        <p className="font-mono text-xs text-dim">checking the pigeonhole…</p>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div>
        {switcher}
        <p className="rounded border border-dashed border-line p-4 text-center text-sm text-dim">
          Nothing yet. Tags and films people send you land here.
        </p>
      </div>
    );
  }

  return (
    <div>
      {switcher}
    <ul className="flex flex-col gap-2">
      {items.map((n) => {
        const movieId = Number(n.props.movieId);
        const href =
          n.kind === "film_sent" && Number.isFinite(movieId)
            ? `/m/${movieId}`
            : n.actor?.handle
              ? `/u/${n.actor.handle}`
              : "/lobby";
        const note = typeof n.props.note === "string" ? n.props.note : null;
        return (
          <li key={n.id}>
            <Link
              href={href}
              className={`flex items-start gap-2.5 rounded border p-3 ${
                n.readAt ? "border-line bg-surface" : "border-amber/40 bg-amber/5"
              }`}
            >
              <Avatar url={n.actor?.avatarUrl ?? null} name={who(n.actor)} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-cream">
                  <span className="font-medium text-amber">{who(n.actor)}</span>{" "}
                  {n.kind === "mention" ? "tagged you in a comment." : "sent you a film."}
                </p>
                {note && <p className="mt-0.5 truncate text-[0.8rem] text-dim">“{note}”</p>}
                <p className="mt-0.5 font-mono text-[0.55rem] uppercase tracking-widest text-dim">
                  {ago(n.createdAt)} ago
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
    </div>
  );
}
