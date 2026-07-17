import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cacheMovie } from "@/lib/tmdb";
import { THEME_KEYS } from "@/lib/themes";

const Input = z.object({
  handle: z
    .string()
    .regex(/^[a-z0-9_]{3,24}$/i, "3-24 letters, numbers, underscores")
    .nullish(),
  displayName: z.string().min(1).max(60).nullish(),
  theme: z.enum(THEME_KEYS).nullish(),
  // null clears the signature film; a number sets it.
  signatureMovieId: z.number().int().positive().nullable().optional(),
});

export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  const updates: Record<string, string | number | null> = {};
  if (parsed.data.handle) updates.handle = parsed.data.handle.toLowerCase();
  if (parsed.data.displayName) updates.display_name = parsed.data.displayName;
  if (parsed.data.theme) updates.profile_theme = parsed.data.theme;
  if (parsed.data.signatureMovieId !== undefined) {
    if (parsed.data.signatureMovieId !== null) {
      // Validate + cache so the profile backdrop always has a real poster.
      const movie = await cacheMovie(parsed.data.signatureMovieId).catch(() => null);
      if (!movie) return NextResponse.json({ error: "unknown_movie" }, { status: 404 });
    }
    updates.signature_movie_id = parsed.data.signatureMovieId;
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ ok: true });

  const db = supabaseAdmin();
  let { error } = await db.from("users").update(updates).eq("id", user.id);
  if (error && ("profile_theme" in updates || "signature_movie_id" in updates)) {
    // Migration 0004 may not be applied yet — retry with the legacy shape,
    // but tell the client styling didn't stick.
    delete updates.profile_theme;
    delete updates.signature_movie_id;
    if (Object.keys(updates).length > 0) {
      ({ error } = await db.from("users").update(updates).eq("id", user.id));
      if (!error) return NextResponse.json({ ok: true, styleSkipped: true });
    } else {
      return NextResponse.json({ ok: false, styleSkipped: true }, { status: 200 });
    }
  }
  if (error) {
    const status = error.code === "23505" ? 409 : 500; // handle taken
    return NextResponse.json({ error: status === 409 ? "handle_taken" : error.message }, { status });
  }
  return NextResponse.json({ ok: true });
}
