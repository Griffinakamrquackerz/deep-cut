import { NextResponse } from "next/server";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Full account deletion (App Store guideline 5.1.1(v)). Deleting the auth
 * user cascades through public.users into every owned row (loved, logs,
 * recs, playlists, follows, profiles — all FK ON DELETE CASCADE from 0001).
 * The avatar file is removed explicitly since storage doesn't cascade.
 */
export async function DELETE() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = supabaseAdmin();

  await db.storage
    .from("avatars")
    .remove([`${user.id}.jpg`])
    .catch(() => null);

  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Clear the session cookie so the client lands signed-out cleanly.
  const supabase = await supabaseServer();
  await supabase.auth.signOut().catch(() => null);

  return NextResponse.json({ ok: true });
}
