import { NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBlockedIds } from "@/lib/safety";

export interface Suggestion {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  reason: string;
  score: number;
}

/**
 * Who to follow. On-brand for a taste app: shared-taste (people who love the
 * same films as you) is the strongest signal, then friends-of-friends, then
 * recently-active members so a brand-new user still sees somebody. Excludes
 * yourself, people you already follow, and blocked users.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = supabaseAdmin();
  const [{ data: myFollows }, blocked, { data: myLoved }] = await Promise.all([
    db.from("follows").select("followee_id").eq("follower_id", user.id),
    getBlockedIds(user.id),
    db.from("loved_movies").select("movie_id").eq("user_id", user.id).limit(80),
  ]);

  const followingIds = (myFollows ?? []).map((r) => r.followee_id as string);
  const exclude = new Set<string>([user.id, ...followingIds, ...blocked]);

  const scores = new Map<string, number>();
  const reasons = new Map<string, string>();
  const bump = (id: string, add: number, reason: string) => {
    if (exclude.has(id)) return;
    scores.set(id, (scores.get(id) ?? 0) + add);
    if (!reasons.has(id)) reasons.set(id, reason); // first (strongest) reason wins
  };

  // 1. Shared taste — people who loved the films you loved. (weight 3 each)
  const lovedIds = (myLoved ?? []).map((r) => r.movie_id as number);
  if (lovedIds.length) {
    const { data: overlap } = await db
      .from("loved_movies")
      .select("user_id, movie_id")
      .in("movie_id", lovedIds)
      .neq("user_id", user.id)
      .limit(600);
    const shared = new Map<string, number>();
    for (const r of overlap ?? []) {
      const uid = r.user_id as string;
      if (exclude.has(uid)) continue;
      shared.set(uid, (shared.get(uid) ?? 0) + 1);
    }
    for (const [uid, n] of shared) {
      bump(uid, n * 3, `Shares ${n} of your loved film${n === 1 ? "" : "s"}`);
    }
  }

  // 2. Friends of friends — followed by people you follow. (weight 2 each)
  if (followingIds.length) {
    const { data: fof } = await db
      .from("follows")
      .select("followee_id")
      .in("follower_id", followingIds)
      .limit(600);
    const mutual = new Map<string, number>();
    for (const r of fof ?? []) {
      const uid = r.followee_id as string;
      if (exclude.has(uid)) continue;
      mutual.set(uid, (mutual.get(uid) ?? 0) + 1);
    }
    for (const [uid, n] of mutual) {
      bump(uid, n * 2, `Followed by ${n} you follow`);
    }
  }

  // 3. Recently active — logged a watch lately. Keeps the list warm for
  //    brand-new users with no follows or overlap yet. (weight 1)
  const { data: active } = await db
    .from("watch_logs")
    .select("user_id, watched_at")
    .order("watched_at", { ascending: false })
    .limit(120);
  const seenActive = new Set<string>();
  for (const r of active ?? []) {
    const uid = r.user_id as string;
    if (seenActive.has(uid)) continue;
    seenActive.add(uid);
    bump(uid, 1, "Active in the theater lately");
  }

  const ranked = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => id);
  if (ranked.length === 0) return NextResponse.json({ suggestions: [] });

  const { data: people } = await db
    .from("users")
    .select("id, handle, display_name, avatar_url")
    .in("id", ranked);

  const byId = new Map((people ?? []).map((p) => [p.id as string, p]));
  const suggestions: Suggestion[] = ranked
    .map((id) => {
      const p = byId.get(id);
      if (!p) return null;
      return {
        id,
        handle: (p.handle as string | null) ?? null,
        display_name: (p.display_name as string | null) ?? null,
        avatar_url: (p.avatar_url as string | null) ?? null,
        reason: reasons.get(id) ?? "Worth a follow",
        score: scores.get(id) ?? 0,
      };
    })
    .filter((s): s is Suggestion => s !== null);

  return NextResponse.json({ suggestions });
}
