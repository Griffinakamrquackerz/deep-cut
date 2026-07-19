// Hot Takes — 250 characters of nitrate-burning opinion, pinned to a film.
// Storage rides the events table (present since 0001, so this works on every
// install with zero migration): name "hot_take" rows are takes, "take_reaction"
// rows are 🔥/🥊 votes (latest per user+take wins, null clears). A dev team can
// graduate these to real tables later without changing the API shape.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getBlockedIds } from "./safety";

export const TAKE_MAX = 250;

export interface HotTake {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; handle: string | null; displayName: string | null; avatarUrl: string | null };
  movie: { id: number; title: string; year: number | null; posterPath: string | null } | null;
  fires: number;
  fights: number;
  myReaction: "fire" | "fight" | null;
  mine: boolean;
}

export async function createTake(
  db: SupabaseClient,
  userId: string,
  movieId: number,
  body: string,
): Promise<{ id: string } | null> {
  const { data, error } = await db
    .from("events")
    .insert({ user_id: userId, name: "hot_take", props: { movie_id: movieId, body } })
    .select("id")
    .single();
  return error || !data ? null : { id: data.id as string };
}

export async function deleteTake(
  db: SupabaseClient,
  takeId: string,
  requesterId: string,
  isAdmin: boolean,
): Promise<boolean> {
  let q = db.from("events").delete({ count: "exact" }).eq("id", takeId).eq("name", "hot_take");
  if (!isAdmin) q = q.eq("user_id", requesterId);
  const { error, count } = await q;
  if (error) return false;
  // Best-effort: sweep the take's reactions too.
  await db
    .from("events")
    .delete()
    .eq("name", "take_reaction")
    .eq("props->>take_id", takeId)
    .then(() => null, () => null);
  return (count ?? 0) > 0;
}

export async function reactToTake(
  db: SupabaseClient,
  userId: string,
  takeId: string,
  kind: "fire" | "fight" | null,
): Promise<boolean> {
  const { error } = await db
    .from("events")
    .insert({ user_id: userId, name: "take_reaction", props: { take_id: takeId, kind } });
  return !error;
}

export async function listTakes(
  db: SupabaseClient,
  opts: { movieId?: number; viewerId?: string | null; limit?: number },
): Promise<HotTake[]> {
  const { movieId, viewerId = null, limit = 60 } = opts;

  let q = db
    .from("events")
    .select("id, user_id, props, created_at")
    .eq("name", "hot_take")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (movieId) q = q.eq("props->>movie_id", String(movieId));
  const { data: rows } = await q;
  if (!rows?.length) return [];

  const blocked = viewerId ? await getBlockedIds(viewerId) : [];
  const blockedSet = new Set(blocked);
  const takes = rows.filter((r) => r.user_id && !blockedSet.has(r.user_id as string));
  if (!takes.length) return [];

  const takeIds = takes.map((t) => t.id as string);
  const userIds = [...new Set(takes.map((t) => t.user_id as string))];
  const movieIds = [
    ...new Set(
      takes
        .map((t) => Number((t.props as Record<string, unknown>)?.movie_id))
        .filter((n) => Number.isFinite(n)),
    ),
  ];

  const [{ data: authors }, { data: movies }, { data: reactions }] = await Promise.all([
    db.from("users").select("id, handle, display_name, avatar_url").in("id", userIds),
    movieIds.length
      ? db.from("movies").select("id, title, year, poster_path").in("id", movieIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    db
      .from("events")
      .select("user_id, props, created_at")
      .eq("name", "take_reaction")
      .in("props->>take_id", takeIds)
      .order("created_at", { ascending: true })
      .limit(2000),
  ]);

  const authorById = new Map((authors ?? []).map((a) => [a.id as string, a]));
  const movieById = new Map((movies ?? []).map((m) => [m.id as number, m]));

  // Latest reaction per (user, take) wins; null kind clears it.
  const latest = new Map<string, "fire" | "fight" | null>();
  for (const r of reactions ?? []) {
    const p = (r.props ?? {}) as Record<string, unknown>;
    const tid = typeof p.take_id === "string" ? p.take_id : null;
    const uid = r.user_id as string | null;
    if (!tid || !uid) continue;
    const kind = p.kind === "fire" || p.kind === "fight" ? p.kind : null;
    latest.set(`${tid}|${uid}`, kind);
  }
  const counts = new Map<string, { fire: number; fight: number }>();
  const mine = new Map<string, "fire" | "fight" | null>();
  for (const [key, kind] of latest) {
    const [tid, uid] = key.split("|");
    if (viewerId && uid === viewerId) mine.set(tid, kind);
    if (!kind) continue;
    const c = counts.get(tid) ?? { fire: 0, fight: 0 };
    c[kind]++;
    counts.set(tid, c);
  }

  return takes.map((t) => {
    const p = (t.props ?? {}) as Record<string, unknown>;
    const a = authorById.get(t.user_id as string);
    const mid = Number(p.movie_id);
    const m = movieById.get(mid);
    const c = counts.get(t.id as string) ?? { fire: 0, fight: 0 };
    return {
      id: t.id as string,
      body: typeof p.body === "string" ? p.body.slice(0, TAKE_MAX) : "",
      createdAt: t.created_at as string,
      author: {
        id: t.user_id as string,
        handle: (a?.handle as string | null) ?? null,
        displayName: (a?.display_name as string | null) ?? null,
        avatarUrl: (a?.avatar_url as string | null) ?? null,
      },
      movie: m
        ? {
            id: m.id as number,
            title: m.title as string,
            year: (m.year as number | null) ?? null,
            posterPath: (m.poster_path as string | null) ?? null,
          }
        : null,
      fires: c.fire,
      fights: c.fight,
      myReaction: mine.get(t.id as string) ?? null,
      mine: viewerId === (t.user_id as string),
    };
  });
}
