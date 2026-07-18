import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { setVisibility } from "@/lib/playlist-visibility";
import { track } from "@/lib/analytics";

const Input = z.object({ playlistId: z.string().uuid(), isPublic: z.boolean() });

/** Owner toggles a mixtape between public (anyone with the link / on your
 *  profile) and private (only you). */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const ok = await setVisibility(supabaseAdmin(), user.id, parsed.data.playlistId, parsed.data.isPublic);
  if (!ok) return NextResponse.json({ error: "not_owner_or_failed" }, { status: 403 });

  await track(user.id, "playlist_visibility_set", {
    playlistId: parsed.data.playlistId,
    isPublic: parsed.data.isPublic,
  });
  return NextResponse.json({ ok: true, isPublic: parsed.data.isPublic });
}
