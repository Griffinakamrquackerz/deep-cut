import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listNotifications, unreadCount } from "@/lib/notifications";

// "I sent them a film and they never got it." Answering that used to mean
// guessing between three different failures — the row never wrote, the row
// wrote and their app is too old to draw it, or they're looking in the wrong
// place. This says which.
//
// Admin only, and deliberately thin: who the handle resolved to, how many rows
// are addressed to them, and the shape of the recent ones. Never the note
// somebody wrote, which is theirs.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const handle = new URL(request.url).searchParams.get("handle")?.trim().replace(/^@/, "");
  if (!handle) return NextResponse.json({ error: "handle_required" }, { status: 400 });

  const db = supabaseAdmin();

  const { data: person } = await db
    .from("users")
    .select("id, handle, display_name")
    .ilike("handle", handle)
    .maybeSingle();

  // A send resolves a person by id from the picker, so "no such handle" here
  // means the recipient isn't who the sender thinks they are.
  if (!person) return NextResponse.json({ found: false, handle });

  const { data: rows, error } = await db
    .from("notifications")
    .select("id, kind, props, read_at, created_at, actor_id")
    .eq("user_id", person.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ found: true, error: error.message }, { status: 500 });
  }

  // Reading the inbox is a different query from writing it — it joins the
  // actor in — and it can fail on its own. Run the real one so a row that
  // exists but won't render is distinguishable from a row that never wrote.
  // This is the failure that looks like nothing happened while the badge still
  // counts, because the count doesn't use the join.
  const rendered = await listNotifications(db, person.id).catch(() => null);
  const unread = await unreadCount(db, person.id).catch(() => -1);

  return NextResponse.json({
    found: true,
    person: { id: person.id, handle: person.handle, displayName: person.display_name },
    // What's actually in the table, straight, with no join.
    total: rows?.length ?? 0,
    // What the inbox screen would draw. Lower than total means the read path
    // is broken, not the write path.
    rendered: rendered === null ? "READ_FAILED" : rendered.length,
    // Whether the actor resolved — a row whose actor is missing renders as
    // "someone", which reads like a bug to whoever is looking at it.
    actorsResolved: (rendered ?? []).filter((r) => r.actor !== null).length,
    unread,
    recent: (rows ?? []).map((r) => ({
      kind: r.kind,
      // The film, not the message — a note is between the two of them.
      movieId: (r.props as Record<string, unknown> | null)?.movieId ?? null,
      hasNote: !!(r.props as Record<string, unknown> | null)?.note,
      read: !!r.read_at,
      createdAt: r.created_at,
      actorId: r.actor_id,
    })),
  });
}
