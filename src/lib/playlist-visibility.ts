// Mixtape visibility with a zero-migration fallback, mirroring profile-style:
// the preferred home is playlists.is_public (migration 0006); until that's
// applied, visibility lives as "playlist_visibility" rows in the events table
// (latest per playlist wins). Default is public, so nothing changes for tapes
// made before this shipped.

import type { SupabaseClient } from "@supabase/supabase-js";

const EVENT = "playlist_visibility";

/** Map playlist id → is_public (defaults to true for anything unseen). */
export async function getVisibilityMap(
  db: SupabaseClient,
  playlistIds: string[],
): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  if (playlistIds.length === 0) return map;

  // Preferred: the is_public column.
  const col = await db.from("playlists").select("id, is_public").in("id", playlistIds);
  if (!col.error) {
    for (const r of col.data ?? []) {
      map.set(r.id as string, (r.is_public as boolean | null) ?? true);
    }
    for (const id of playlistIds) if (!map.has(id)) map.set(id, true);
    return map;
  }

  // Fallback: newest playlist_visibility event per playlist.
  const { data: evs } = await db
    .from("events")
    .select("props, created_at")
    .eq("name", EVENT)
    .order("created_at", { ascending: false })
    .limit(1000);
  const ids = new Set(playlistIds);
  const seen = new Set<string>();
  for (const e of evs ?? []) {
    const p = (e.props ?? {}) as Record<string, unknown>;
    const pid = typeof p.playlist_id === "string" ? p.playlist_id : null;
    if (!pid || seen.has(pid) || !ids.has(pid)) continue;
    seen.add(pid);
    map.set(pid, p.is_public !== false); // anything but explicit false is public
  }
  for (const id of playlistIds) if (!map.has(id)) map.set(id, true);
  return map;
}

/** Owner-only. Writes the column, falling back to an events row pre-migration. */
export async function setVisibility(
  db: SupabaseClient,
  userId: string,
  playlistId: string,
  isPublic: boolean,
): Promise<boolean> {
  const { data: pl } = await db
    .from("playlists")
    .select("owner_id")
    .eq("id", playlistId)
    .maybeSingle();
  if (!pl || (pl.owner_id as string) !== userId) return false;

  const upd = await db.from("playlists").update({ is_public: isPublic }).eq("id", playlistId);
  if (!upd.error) return true;

  const { error } = await db
    .from("events")
    .insert({ user_id: userId, name: EVENT, props: { playlist_id: playlistId, is_public: isPublic } });
  return !error;
}
