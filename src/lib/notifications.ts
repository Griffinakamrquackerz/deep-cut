import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { pushToUser, type UserPush } from "@/lib/push-user";
import { siteUrl } from "@/lib/site";

// The inbox. One row per thing that happened to you, newest first, with an
// unread count for the badge.
//
// Writes report whether they landed, and the caller decides what that means.
// For a mention the notification really is a courtesy — the comment posted
// either way, so a failed insert must not fail the comment. For a sent film
// there is no other action: the row IS the delivery, and swallowing that
// failure means telling somebody "Sent" when nothing was sent. An earlier
// version of this file swallowed both, which is how a send could report
// success to the sender and never appear in the recipient's inbox.
//
// Nothing here throws. Failures come back as false and are logged, so a broken
// inbox degrades rather than taking a route down with it.

export type NotificationKind = "mention" | "film_sent";

/**
 * Ring the bell for a row that just landed, after the response has gone out.
 *
 * next/server's after() runs this once the request is done, so a send waits on
 * a database insert but never on two push services. Outside a request context
 * after() throws — hence the fallback, which matters because the caller must
 * not care where it was called from.
 */
function ring(db: SupabaseClient, userId: string, push: UserPush): void {
  const send = () => pushToUser(db, userId, push, siteUrl()).catch(() => undefined);
  try {
    after(send);
  } catch {
    void send();
  }
}

export interface NotificationActor {
  id: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface NotificationRow {
  id: string;
  kind: NotificationKind;
  props: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
  actor: NotificationActor | null;
}

type Row = Record<string, unknown>;

function toActor(u: unknown): NotificationActor | null {
  const x = u as Row | null;
  if (!x?.id) return null;
  return {
    id: String(x.id),
    handle: (x.handle as string | null) ?? null,
    displayName: (x.display_name as string | null) ?? null,
    avatarUrl: (x.avatar_url as string | null) ?? null,
  };
}

/**
 * Post to somebody's inbox. True if a row landed.
 *
 * Never notifies you about your own doing — tagging yourself in your own
 * comment is a thing people do by accident, and a badge for it is noise. That
 * case returns false too: nothing was written, and a caller that reports
 * delivery should not claim one.
 */
export async function notify(
  db: SupabaseClient,
  input: {
    userId: string;
    actorId: string | null;
    kind: NotificationKind;
    props?: Record<string, unknown>;
    /** Ring their devices too. Omit for a row that should stay quiet. */
    push?: UserPush;
  },
): Promise<boolean> {
  if (input.actorId && input.actorId === input.userId) return false;
  try {
    // supabase-js resolves with { error } rather than rejecting, so a rejection
    // handler alone never sees a database error. Read the error.
    const { error } = await db.from("notifications").insert({
      user_id: input.userId,
      actor_id: input.actorId,
      kind: input.kind,
      props: input.props ?? {},
    });
    if (error) {
      console.error("notify failed", { kind: input.kind, message: error.message });
      return false;
    }
    // Only after the row is safely down — a push for something that isn't in
    // the inbox sends someone to an empty screen.
    if (input.push) ring(db, input.userId, input.push);
    return true;
  } catch (err) {
    console.error("notify threw", err);
    return false;
  }
}

/**
 * Several at once, de-duplicated — one comment tagging you twice is one ping.
 * Returns how many rows landed.
 */
export async function notifyMany(
  db: SupabaseClient,
  userIds: string[],
  input: {
    actorId: string | null;
    kind: NotificationKind;
    props?: Record<string, unknown>;
    /** Ring every recipient's devices too. Omit to stay quiet. */
    push?: UserPush;
  },
): Promise<number> {
  const unique = [...new Set(userIds)].filter((id) => id && id !== input.actorId);
  if (!unique.length) return 0;
  try {
    const { error } = await db.from("notifications").insert(
      unique.map((id) => ({
        user_id: id,
        actor_id: input.actorId,
        kind: input.kind,
        props: input.props ?? {},
      })),
    );
    if (error) {
      console.error("notifyMany failed", { kind: input.kind, message: error.message });
      return 0;
    }
    if (input.push) for (const id of unique) ring(db, id, input.push);
    return unique.length;
  } catch (err) {
    console.error("notifyMany threw", err);
    return 0;
  }
}

export async function listNotifications(
  db: SupabaseClient,
  userId: string,
  limit = 40,
): Promise<NotificationRow[]> {
  const { data, error } = await db
    .from("notifications")
    .select("id, kind, props, read_at, created_at, users!notifications_actor_id_fkey(id, handle, display_name, avatar_url)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  // The join names a foreign key by constraint name. If that name is ever
  // wrong the query errors and this returns nothing — an inbox that reads as
  // empty while the rows are sitting right there, and while the unread badge
  // (which doesn't join) still counts them. Loud in the logs, soft on screen.
  if (error) console.error("listNotifications failed", error.message);

  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r.id),
    kind: r.kind as NotificationKind,
    props: (r.props as Record<string, unknown>) ?? {},
    readAt: (r.read_at as string | null) ?? null,
    createdAt: String(r.created_at),
    actor: toActor(r.users),
  }));
}

export interface SentRow {
  id: string;
  movieId: number | null;
  title: string | null;
  note: string | null;
  /** When they opened their inbox, or null if they haven't yet. */
  seenAt: string | null;
  sentAt: string;
  to: NotificationActor | null;
}

/**
 * What you handed to other people.
 *
 * The inbox is inbound by design — a row belongs to whoever it happened to —
 * so a send left the sender with a toast and no record. This reads the same
 * table from the other end: rows where you are the actor.
 *
 * Films only. A mention you made is already visible in the comment you wrote;
 * a film you sent somebody privately is otherwise nowhere.
 */
export async function listSent(
  db: SupabaseClient,
  userId: string,
  limit = 40,
): Promise<SentRow[]> {
  const { data, error } = await db
    .from("notifications")
    // The other foreign key: user_id is the recipient, actor_id is you.
    .select("id, props, read_at, created_at, users!notifications_user_id_fkey(id, handle, display_name, avatar_url)")
    .eq("actor_id", userId)
    .eq("kind", "film_sent")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("listSent failed", error.message);
    return [];
  }

  const rows = (data ?? []) as Row[];
  const ids = [
    ...new Set(
      rows
        .map((r) => Number((r.props as Record<string, unknown>)?.movieId))
        .filter((n) => Number.isFinite(n)),
    ),
  ];

  // One lookup for every film in the list rather than one per row.
  const titles = new Map<number, string>();
  if (ids.length) {
    const { data: films } = await db.from("movies").select("id, title").in("id", ids);
    for (const f of (films ?? []) as Array<{ id: number; title: string }>) {
      titles.set(f.id, f.title);
    }
  }

  return rows.map((r) => {
    const props = (r.props as Record<string, unknown>) ?? {};
    const movieId = Number(props.movieId);
    const id = Number.isFinite(movieId) ? movieId : null;
    return {
      id: String(r.id),
      movieId: id,
      title: id !== null ? (titles.get(id) ?? null) : null,
      note: (props.note as string | null) ?? null,
      seenAt: (r.read_at as string | null) ?? null,
      sentAt: String(r.created_at),
      to: toActor(r.users),
    };
  });
}

export async function unreadCount(db: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) console.error("unreadCount failed", error.message);
  return count ?? 0;
}

/** Mark the whole inbox read, or one row of it. */
export async function markRead(
  db: SupabaseClient,
  userId: string,
  id?: string,
): Promise<void> {
  let q = db
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  if (id) q = q.eq("id", id);
  await q.then(
    () => undefined,
    () => undefined,
  );
}
