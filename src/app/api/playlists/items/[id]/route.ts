import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PlaylistItemUpdateInput } from "@/lib/schemas";
import { track } from "@/lib/analytics";

const Body = PlaylistItemUpdateInput.extend({
  slug: z.string().min(6).max(24).optional(), // capability for recipients
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "signup_required" }, { status: 401 });

  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { slug, crossedOff, reaction, note } = parsed.data;

  const db = supabaseAdmin();
  const { data: item } = await db
    .from("playlist_items")
    .select("id, playlist_id, playlists(owner_id, share_slug, recipient_user_id)")
    .eq("id", id)
    .maybeSingle();
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const playlist = item.playlists as unknown as {
    owner_id: string;
    share_slug: string;
    recipient_user_id: string | null;
  };

  const isOwner = playlist.owner_id === user.id;
  const holdsSlug = slug != null && slug === playlist.share_slug;
  if (!isOwner && !holdsSlug) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // First interaction from a link-holder claims the recipient seat.
  if (!isOwner && !playlist.recipient_user_id) {
    await db
      .from("playlists")
      .update({ recipient_user_id: user.id })
      .eq("id", item.playlist_id)
      .is("recipient_user_id", null);
  }

  const updates: Record<string, unknown> = {};
  if (crossedOff !== undefined) updates.crossed_off = crossedOff;
  if (reaction !== undefined) updates.reaction = reaction;
  if (note !== undefined) updates.note = note;
  if (Object.keys(updates).length === 0) return NextResponse.json({ ok: true });

  const { error } = await db.from("playlist_items").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (crossedOff) {
    await track(user.id, "playlist_item_crossed", { itemId: id, playlistId: item.playlist_id });
  }
  return NextResponse.json({ ok: true });
}
