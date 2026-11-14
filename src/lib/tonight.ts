import type { SupabaseClient } from "@supabase/supabase-js";

// What you're watching tonight — a status, not a log.
//
// watch_logs already records what you HAVE seen. This is the other half: what
// you're about to put on, which is only interesting before you've done it.
// One row per person, replaced when they change their mind, and it goes stale
// on its own so the Lobby never shows a plan from last March.

/**
 * How long a plan stays up.
 *
 * Eighteen hours, not twenty-four: an evening's plan should still be there
 * when someone checks over breakfast, and gone by the time the next evening
 * starts. A full day would mean tonight's Lobby is half full of yesterday.
 */
const LIVE_HOURS = 18;

export interface TonightPlan {
  userId: string;
  movieId: number;
  note: string | null;
  setAt: string;
  expiresAt: string;
}

type Row = Record<string, unknown>;

function toPlan(r: Row): TonightPlan {
  return {
    userId: String(r.user_id),
    movieId: Number(r.movie_id),
    note: (r.note as string | null) ?? null,
    setAt: String(r.set_at),
    expiresAt: String(r.expires_at),
  };
}

export async function setTonight(
  db: SupabaseClient,
  userId: string,
  movieId: number,
  note: string | null,
): Promise<TonightPlan | null> {
  const now = new Date();
  const expires = new Date(now.getTime() + LIVE_HOURS * 3600_000);
  const { data, error } = await db
    .from("tonight")
    .upsert(
      {
        user_id: userId,
        movie_id: movieId,
        note: note?.trim() ? note.trim() : null,
        set_at: now.toISOString(),
        expires_at: expires.toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();
  return error || !data ? null : toPlan(data as Row);
}

export async function clearTonight(db: SupabaseClient, userId: string): Promise<void> {
  await db
    .from("tonight")
    .delete()
    .eq("user_id", userId)
    .then(
      () => undefined,
      () => undefined,
    );
}

/** One person's live plan, or null if they haven't said or it's gone stale. */
export async function getTonight(
  db: SupabaseClient,
  userId: string,
): Promise<TonightPlan | null> {
  const { data } = await db
    .from("tonight")
    .select("*")
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return data ? toPlan(data as Row) : null;
}

export interface TonightCard {
  movieId: number;
  title: string;
  year: number | null;
  posterPath: string | null;
  /** For Poster's typographic fallback when TMDB has no art. */
  genres: string[];
  note: string | null;
  expiresAt: string;
}

/**
 * A plan with the film's name already on it — what a profile page renders.
 *
 * The row only stores an id, and a page that has a database connection in hand
 * shouldn't make the browser go back out for the title.
 */
export async function tonightCard(
  db: SupabaseClient,
  userId: string,
): Promise<TonightCard | null> {
  const { data } = await db
    .from("tonight")
    .select("movie_id, note, expires_at, movies(id, title, year, poster_path, genres)")
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data) return null;

  const film = (data as Row).movies as unknown as
    | {
        id: number;
        title: string;
        year: number | null;
        poster_path: string | null;
        genres: string[] | null;
      }
    | null;
  if (!film) return null; // the film fell out of the cache; say nothing

  return {
    movieId: film.id,
    title: film.title,
    year: film.year,
    posterPath: film.poster_path ?? null,
    genres: film.genres ?? [],
    note: ((data as Row).note as string | null) ?? null,
    expiresAt: String((data as Row).expires_at),
  };
}

/** Live plans from anyone — the house feed, for somebody who follows nobody. */
export async function tonightHouse(db: SupabaseClient, limit = 20): Promise<TonightPlan[]> {
  const { data } = await db
    .from("tonight")
    .select("*")
    .gt("expires_at", new Date().toISOString())
    .order("set_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as Row[]).map(toPlan);
}

/** Live plans for a set of people — what the Lobby asks for. */
export async function tonightFor(
  db: SupabaseClient,
  userIds: string[],
): Promise<TonightPlan[]> {
  if (!userIds.length) return [];
  const { data } = await db
    .from("tonight")
    .select("*")
    .in("user_id", userIds)
    .gt("expires_at", new Date().toISOString())
    .order("set_at", { ascending: false });
  return ((data ?? []) as Row[]).map(toPlan);
}
