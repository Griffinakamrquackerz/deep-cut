import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listNotifications, listSent, markRead, unreadCount } from "@/lib/notifications";

// Your inbox. GET reads it, POST marks it read — the whole thing, or one row.
// ?box=sent reads the other end: what you handed to other people.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = supabaseAdmin();

  if (new URL(request.url).searchParams.get("box") === "sent") {
    const sent = await listSent(db, user.id).catch(() => []);
    return NextResponse.json({ sent });
  }
  // A missing table (migration 0012 not applied) reads as an empty inbox
  // rather than an error — the badge is furniture on every screen, and
  // furniture must not throw.
  const [items, unread] = await Promise.all([
    listNotifications(db, user.id).catch(() => []),
    unreadCount(db, user.id).catch(() => 0),
  ]);
  return NextResponse.json({ items, unread });
}

const Input = z.object({ id: z.string().uuid().optional() });

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Input.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  await markRead(supabaseAdmin(), user.id, parsed.data.id);
  return NextResponse.json({ ok: true });
}
