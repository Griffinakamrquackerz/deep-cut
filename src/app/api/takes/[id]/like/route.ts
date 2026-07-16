import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Toggle a like. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = supabaseAdmin();
  const { data: existing } = await db
    .from("take_likes")
    .select("take_id")
    .eq("take_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    await db.from("take_likes").delete().eq("take_id", id).eq("user_id", user.id);
    return NextResponse.json({ liked: false });
  }
  const { error } = await db.from("take_likes").insert({ take_id: id, user_id: user.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ liked: true });
}
