import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Store (or remove) a browser push subscription. Rows live in
// public.push_subscriptions (migration 0005). If that migration hasn't been
// applied yet we fail soft — the UI treats a non-ok response as "not enabled"
// rather than crashing.

const SubSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = SubSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_subscription" }, { status: 400 });
  }
  const { endpoint, keys } = parsed.data;

  const { error } = await supabaseAdmin()
    .from("push_subscriptions")
    .upsert(
      { endpoint, user_id: user.id, p256dh: keys.p256dh, auth: keys.auth },
      { onConflict: "endpoint" },
    );
  if (error) {
    // Almost always "relation does not exist" — migration 0005 not run yet.
    return NextResponse.json({ ok: false, reason: "storage_unavailable" }, { status: 200 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const endpoint = new URL(req.url).searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ error: "missing_endpoint" }, { status: 400 });

  await supabaseAdmin()
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
