import { supabaseAdmin } from "./supabase/admin";

// Per-user daily caps. These are product guardrails, NOT cost limits — on the
// free Groq/TMDB/OMDb tiers there's no dollar spend. Tune via env:
//   DAILY_REC_BATCHES     (default 25)  — "Deal me more" batches/day
//   DAILY_PROFILE_REGENS  (default 10)  — manual "refresh my profile"/day
// Set a big number (e.g. 9999) for effectively unlimited on a personal instance.
function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

export const DAILY_LIMITS = {
  profile_regen: envInt("DAILY_PROFILE_REGENS", 10),
  rec_batch: envInt("DAILY_REC_BATCHES", 25),
};

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

/** Give back a consumed slot (e.g. the deal failed) — errors shouldn't burn quota. */
export async function refund(userId: string, kind: LimitKind): Promise<void> {
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
  if (current > 0) {
    await db
      .from("usage_counters")
      .upsert({ user_id: userId, day, kind, count: current - 1 });
  }
}
