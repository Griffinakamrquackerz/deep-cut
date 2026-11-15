import { supabaseAdmin } from "./supabase/admin";
import { FREE_DEALS_PER_WINDOW, PREMIUM_DEALS_PER_DAY } from "./deal-limits";

// Per-user daily caps. These are product guardrails, NOT cost limits — on the
// free Groq/TMDB/OMDb tiers there's no dollar spend. Tune via env:
//   DAILY_PROFILE_REGENS      (default 10) — manual "refresh my profile"/day
// Set a big number (e.g. 9999) for effectively unlimited on a personal instance.
function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

export const DAILY_LIMITS = {
  profile_regen: envInt("DAILY_PROFILE_REGENS", 10),
  rec_batch: PREMIUM_DEALS_PER_DAY,
  hot_take: envInt("DAILY_HOT_TAKES", 15),
  take_comment: envInt("DAILY_TAKE_COMMENTS", 60),
  taste_signal: envInt("DAILY_TASTE_SIGNALS", 200),
  // Sending a film goes to one named person's inbox, so it is exactly the
  // shape of thing that needs a cap: uncapped, it's a way to fill one.
  film_send: envInt("DAILY_FILM_SENDS", 40),
};

/** Free-tier (General Admission) deal cap. */
export const FREE_REC_BATCHES = FREE_DEALS_PER_WINDOW;

export async function reserveFreeDeal(userId: string): Promise<{ allowed: boolean; windowStart: string; resetsAt: string }> {
  const { data, error } = await supabaseAdmin().rpc("reserve_free_deal", {
    p_user_id: userId,
    p_limit: FREE_REC_BATCHES,
  });
  if (error || !Array.isArray(data) || data.length !== 1 ||
      typeof data[0].allowed !== "boolean" || typeof data[0].window_start !== "string" ||
      typeof data[0].resets_at !== "string") {
    throw new Error(`free deal reservation failed: ${error?.message ?? "invalid response"}`);
  }
  return { allowed: data[0].allowed, windowStart: data[0].window_start, resetsAt: data[0].resets_at };
}

export async function refundFreeDeal(userId: string, windowStart: string): Promise<void> {
  const { error } = await supabaseAdmin().rpc("refund_free_deal", {
    p_user_id: userId,
    p_window_start: windowStart,
  });
  if (error) throw new Error(`free deal refund failed: ${error.message}`);
}

export type LimitKind = keyof typeof DAILY_LIMITS;

/** Returns true and increments if under today's limit; false when exhausted. */
export async function checkAndIncrement(
  userId: string,
  kind: LimitKind,
  limitOverride?: number,
): Promise<boolean> {
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
  if (current >= (limitOverride ?? DAILY_LIMITS[kind])) return false;

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
