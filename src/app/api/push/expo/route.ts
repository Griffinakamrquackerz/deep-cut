import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Native (Expo) push-token registration. Zero-migration: tokens live as
// "expo_push_token" rows in the events table — newest row per token wins, so a
// DELETE is just a newer row with enabled:false. The Friday cron reads these.
const EVENT = "expo_push_token";

function validToken(t: unknown): t is string {
  return typeof t === "string" && /^ExponentPushToken\[.+\]$/.test(t);
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  if (!validToken(body?.token)) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const { error } = await supabaseAdmin()
    .from("events")
    .insert({ user_id: user.id, name: EVENT, props: { token: body!.token, enabled: true } });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  if (!validToken(body?.token)) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  await supabaseAdmin()
    .from("events")
    .insert({ user_id: user.id, name: EVENT, props: { token: body!.token, enabled: false } });
  return NextResponse.json({ ok: true });
}
