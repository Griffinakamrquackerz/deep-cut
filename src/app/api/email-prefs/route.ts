import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isOptedOut, optIn, optOut } from "@/lib/email-prefs";

// The programme email, from inside the app. The one-click link in the mail is
// the way out for somebody who has stopped signing in; this is the way back.

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // A missing table (migration 0013) reads as subscribed, which is the default
  // anyway — the switch shows "On" rather than an error.
  const out = await isOptedOut(supabaseAdmin(), user.id, "programme").catch(() => false);
  return NextResponse.json({ programme: !out });
}

const Input = z.object({ programme: z.boolean() });

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const db = supabaseAdmin();
  if (parsed.data.programme) await optIn(db, user.id, "programme");
  else await optOut(db, user.id, "programme");

  return NextResponse.json({ ok: true, programme: parsed.data.programme });
}
