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
      <div className="pigeon mb-3" role="group" aria-label="Inbox">
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
            data-count={t.key === "in" && unread ? String(unread) : undefined}
          >
            {t.label.toUpperCase()}
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
          <ul className="flex flex-col gap-3">
            {sent.map((s) => (
              <li key={s.id}>
                <div className="memo memo--carbon">
                  <p className="memo-head">
                    <b>Copy</b>
                    <span>{ago(s.sentAt)} ago</span>
                  </p>
                  <p className="memo-field">
                    To <span className="memo-pen">{who(s.to)}</span>
                  </p>
                  <p className="memo-field">
                    Film{" "}
                    {s.movieId ? (
                      <Link href={`/m/${s.movieId}`} className="memo-pen hover:underline">
                        {s.title ?? "a film"}
                      </Link>
                    ) : (
                      <span className="memo-pen">{s.title ?? "a film"}</span>
                    )}
                  </p>
                  {s.note && (
                    <p className="memo-field pr-20">
                      Note <span className="memo-pen truncate">“{s.note}”</span>
                    </p>
                  )}
                  <span
                    className={`memo-stamp ${s.seenAt ? "memo-stamp--opened" : "memo-stamp--delivered"}`}
                  >
                    {s.seenAt ? "Opened" : "Delivered"}
                  </span>
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
      <ul className="flex flex-col gap-3">
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
              <Link href={href} className={`memo ${n.readAt ? "memo--read" : "memo--new"}`}>
                <p className="memo-head">
                  <b>While you were out</b>
                  <span>{ago(n.createdAt)} ago</span>
                </p>
                <p className="memo-field">
                  From
                  <span className="inline-flex items-center gap-1.5">
                    <Avatar url={n.actor?.avatarUrl ?? null} name={who(n.actor)} size="sm" />
                    <span className="memo-pen">{who(n.actor)}</span>
                  </span>
                </p>
                <p className="memo-ticks">
                  <span className={n.kind === "mention" ? "on" : ""}>Tagged you</span>
                  <span className={n.kind === "film_sent" ? "on" : ""}>Sent you a film</span>
                </p>
                {note && (
                  <p className="memo-field">
                    Message <span className="memo-pen">“{note}”</span>
                  </p>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
