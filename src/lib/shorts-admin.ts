import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ChannelKey, Short } from "@/lib/shorts";

// The programme's read/write layer — everything the Projection Booth's
// Theatre tab and the public /api/shorts route need, against the `shorts`
// table (migration 0008). Service-role only, same as the rest of this app's
// admin-authored tables: the gate is the caller checking requireAdmin(), not
// a Postgres policy.

export type ShortStatus = "showing" | "archived";

export interface ShortRow extends Short {
  status: ShortStatus;
  position: number;
  addedBy: string | null;
  addedAt: string;
  archivedAt: string | null;
}

interface DbRow {
  id: string;
  title: string;
  director: string;
  year: number;
  runtime_sec: number;
  source: "vimeo" | "youtube";
  video_id: string;
  channels: string[];
  pedigree: string;
  synopsis: string;
  thumb: string | null;
  status: ShortStatus;
  position: number;
  added_by: string | null;
  added_at: string;
  archived_at: string | null;
}

function fromRow(r: DbRow): ShortRow {
  return {
    id: r.id,
    title: r.title,
    director: r.director,
    year: r.year,
    runtimeSec: r.runtime_sec,
    source: r.source,
    videoId: r.video_id,
    channels: r.channels as ChannelKey[],
    pedigree: r.pedigree,
    synopsis: r.synopsis,
    thumb: r.thumb ?? "",
    status: r.status,
    position: r.position,
    addedBy: r.added_by,
    addedAt: r.added_at,
    archivedAt: r.archived_at,
  };
}

/** The live bill — what /api/shorts serves. Ordered for the channel guide. */
export async function programmeShowing(): Promise<Short[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("shorts")
    .select("*")
    .eq("status", "showing")
    .order("position", { ascending: true })
    .order("added_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => fromRow(r as DbRow));
}

/** Everything, showing and archived — the Theatre tab's inventory. */
export async function listAllShorts(): Promise<ShortRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("shorts")
    .select("*")
    .order("status", { ascending: true })
    .order("position", { ascending: true })
    .order("added_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => fromRow(r as DbRow));
}

/** id-1, id-2, ... off a title, and the first one not already taken. */
function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "") // stray accents, once NFKD has split them out
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "short"
  );
}

async function uniqueSlug(title: string): Promise<string> {
  const db = supabaseAdmin();
  const base = slugify(title);
  let candidate = base;
  for (let n = 2; ; n++) {
    const { data } = await db.from("shorts").select("id").eq("id", candidate).maybeSingle();
    if (!data) return candidate;
    candidate = `${base}-${n}`;
  }
}

export interface NewShort {
  title: string;
  director: string;
  year: number;
  runtimeSec: number;
  source: "vimeo" | "youtube";
  videoId: string;
  channels: ChannelKey[];
  pedigree: string;
  synopsis: string;
  thumb: string;
  addedBy: string;
}

export async function createShort(input: NewShort): Promise<ShortRow> {
  const db = supabaseAdmin();
  const id = await uniqueSlug(input.title);
  const { data, error } = await db
    .from("shorts")
    .insert({
      id,
      title: input.title,
      director: input.director,
      year: input.year,
      runtime_sec: input.runtimeSec,
      source: input.source,
      video_id: input.videoId,
      channels: input.channels,
      pedigree: input.pedigree,
      synopsis: input.synopsis,
      thumb: input.thumb || null,
      added_by: input.addedBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return fromRow(data as DbRow);
}

export type ShortEdit = Partial<
  Pick<
    NewShort,
    | "title"
    | "director"
    | "year"
    | "runtimeSec"
    | "source"
    | "videoId"
    | "channels"
    | "pedigree"
    | "synopsis"
    | "thumb"
  >
> & { status?: ShortStatus; position?: number };

export async function updateShort(id: string, edit: ShortEdit): Promise<ShortRow> {
  const db = supabaseAdmin();
  const patch: Record<string, unknown> = {};
  if (edit.title !== undefined) patch.title = edit.title;
  if (edit.director !== undefined) patch.director = edit.director;
  if (edit.year !== undefined) patch.year = edit.year;
  if (edit.runtimeSec !== undefined) patch.runtime_sec = edit.runtimeSec;
  if (edit.source !== undefined) patch.source = edit.source;
  if (edit.videoId !== undefined) patch.video_id = edit.videoId;
  if (edit.channels !== undefined) patch.channels = edit.channels;
  if (edit.pedigree !== undefined) patch.pedigree = edit.pedigree;
  if (edit.synopsis !== undefined) patch.synopsis = edit.synopsis;
  if (edit.thumb !== undefined) patch.thumb = edit.thumb || null;
  if (edit.position !== undefined) patch.position = edit.position;
  if (edit.status !== undefined) {
    patch.status = edit.status;
    patch.archived_at = edit.status === "archived" ? new Date().toISOString() : null;
  }

  const { data, error } = await db.from("shorts").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return fromRow(data as DbRow);
}

export async function deleteShort(id: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("shorts").delete().eq("id", id);
  if (error) throw error;
}
