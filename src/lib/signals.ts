// Taste signals — the soft tier of the learning loop. Loved/logged films are
// endorsements; these are sparks: a film you picked out of a Roll lineup, a
// verdict you accepted on the couch, a take you wrote or fired. They feed both
// speeds of learning (the next deal's prompt AND the periodic profile rewrite)
// but are always weighted below the hard signals. Events-table storage, as ever.

import type { SupabaseClient } from "@supabase/supabase-js";

export type SignalSource = "roll_pick" | "settle_verdict" | "hot_take" | "take_fire";

const SOURCE_LABEL: Record<SignalSource, string> = {
  roll_pick: "picked it out of a Just Roll It lineup",
  settle_verdict: "accepted it as a Settle It verdict",
  hot_take: "wrote a hot take about it",
  take_fire: "fired 🔥 on a take about it",
};

export async function recordTasteSignal(
  db: SupabaseClient,
  userId: string,
  movieId: number,
  source: SignalSource,
): Promise<boolean> {
  const { error } = await db
    .from("events")
    .insert({ user_id: userId, name: "taste_signal", props: { movie_id: movieId, source } });
  return !error;
}

export interface SignalBrief {
  title: string;
  year: number | null;
  source: SignalSource;
}

/** Latest distinct-film signals, newest first, joined to titles. */
export async function getRecentSignals(
  db: SupabaseClient,
  userId: string,
  limit = 12,
): Promise<SignalBrief[]> {
  const { data: rows } = await db
    .from("events")
    .select("props, created_at")
    .eq("user_id", userId)
    .eq("name", "taste_signal")
    .order("created_at", { ascending: false })
    .limit(60);
  if (!rows?.length) return [];

  const seen = new Set<number>();
  const picks: Array<{ movieId: number; source: SignalSource }> = [];
  for (const r of rows) {
    const p = (r.props ?? {}) as Record<string, unknown>;
    const mid = Number(p.movie_id);
    const src = p.source as SignalSource;
    if (!Number.isFinite(mid) || seen.has(mid) || !SOURCE_LABEL[src]) continue;
    seen.add(mid);
    picks.push({ movieId: mid, source: src });
    if (picks.length >= limit) break;
  }
  if (!picks.length) return [];

  const { data: movies } = await db
    .from("movies")
    .select("id, title, year")
    .in("id", picks.map((p) => p.movieId));
  const byId = new Map((movies ?? []).map((m) => [m.id as number, m]));

  return picks
    .map((p) => {
      const m = byId.get(p.movieId);
      if (!m) return null;
      return { title: m.title as string, year: (m.year as number | null) ?? null, source: p.source };
    })
    .filter((s): s is SignalBrief => s !== null);
}

export function signalLine(s: SignalBrief): string {
  return `- ${s.title} (${s.year ?? "?"}): ${SOURCE_LABEL[s.source]}`;
}
