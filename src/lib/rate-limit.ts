import { supabaseAdmin } from "./supabase/admin";

export const DAILY_LIMITS = {
  profile_regen: 1,
  rec_batch: 3,
} as const;

export type LimitKind = keyof typeof DAILY_LIMITS;

/** Returns true and increments if under today's limit; false when exhausted. */
export async function checkAndIncrement(userId: string, kind: LimitKind): Promise<boolean> {
  const db = supabaseAdmin();
  const day = new Date().toISOString().slice(0, 10);
  const { data } = await db
    .from("usage_counters")
    .select("count")
    .eq("user_id", userId)
    .eq("day", day)
    .eq("kind", kind)
    .maybeSingle();

  const current = data?.count ?? 0;
  if (current >= DAILY_LIMITS[kind]) return false;

  await db
    .from("usage_counters")
    .upsert({ user_id: userId, day, kind, count: current + 1 });
  return true;
}
