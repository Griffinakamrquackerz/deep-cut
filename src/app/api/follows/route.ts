import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { FollowInput } from "@/lib/schemas";
import { track } from "@/lib/analytics";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = FollowInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (parsed.data.userId === user.id) {
    return NextResponse.json({ error: "cannot_follow_self" }, { status: 400 });
  }

  const { error } = await supabaseAdmin()
    .from("follows")
    .upsert({ follower_id: user.id, followee_id: parsed.data.userId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await track(user.id, "follow_created", { followee: parsed.data.userId });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = FollowInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  await supabaseAdmin()
    .from("follows")
    .delete()
    .eq("follower_id", user.id)
    .eq("followee_id", parsed.data.userId);
  return NextResponse.json({ ok: true });
}
