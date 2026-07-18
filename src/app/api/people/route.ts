import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBlockedIds } from "@/lib/safety";

export interface PersonRow {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

/**
 * People directory: ?q= searches users by handle/name; without q, returns
 * who you follow and who follows you. Always includes followingIds so the
 * client can render follow state anywhere.
 */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const db = supabaseAdmin();

  const { data: followRows } = await db
    .from("follows")
    .select("followee_id")
    .eq("follower_id", user.id);
  const followingIds = (followRows ?? []).map((r) => r.followee_id as string);
  const blocked = await getBlockedIds(user.id);

  if (q) {
    // ilike pattern chars would let a query escape its wildcard slot.
    const safe = q.replace(/[%_,()]/g, "").slice(0, 40);
    if (!safe) return NextResponse.json({ results: [], followingIds });
    const { data, error } = await db
      .from("users")
      .select("id, handle, display_name, avatar_url")
      .or(`handle.ilike.%${safe}%,display_name.ilike.%${safe}%`)
      .neq("id", user.id)
      .limit(20);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const results = ((data ?? []) as PersonRow[]).filter((r) => !blocked.has(r.id));
    return NextResponse.json({ results, followingIds });
  }

  const [followingRes, followersRes] = await Promise.all([
    followingIds.length
      ? db.from("users").select("id, handle, display_name, avatar_url").in("id", followingIds)
      : Promise.resolve({ data: [] as PersonRow[] }),
    db
      .from("follows")
      .select("follower_id, users!follows_follower_id_fkey(id, handle, display_name, avatar_url)")
      .eq("followee_id", user.id),
  ]);

  const followers = ((followersRes.data ?? []) as Array<Record<string, unknown>>)
    .map((r) => r.users as unknown as PersonRow | null)
    .filter((u): u is PersonRow => !!u && !blocked.has(u.id));

  return NextResponse.json({
    following: (followingRes.data ?? []) as PersonRow[],
    followers,
    followingIds,
  });
}
