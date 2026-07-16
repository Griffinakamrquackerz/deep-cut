import { NextResponse } from "next/server";
import { OnboardingInput } from "@/lib/schemas";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cacheMovies } from "@/lib/tmdb";
import { track } from "@/lib/analytics";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = OnboardingInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { movieIds, services } = parsed.data;

  // Warm the TMDB cache so FK constraints hold and posters render immediately.
  const cached = await cacheMovies(movieIds);
  const validIds = new Set(cached.map((m) => m.id));

  const db = supabaseAdmin();
  const loved = movieIds
    .filter((id) => validIds.has(id))
    .map((movie_id) => ({ user_id: user.id, movie_id }));
  if (loved.length < 8) {
    return NextResponse.json({ error: "too_few_valid_movies" }, { status: 400 });
  }

  const { error: lovedErr } = await db.from("loved_movies").upsert(loved);
  if (lovedErr) return NextResponse.json({ error: lovedErr.message }, { status: 500 });

  await db.from("user_services").delete().eq("user_id", user.id);
  if (services.length > 0) {
    const rows = services.map((service) => ({ user_id: user.id, service }));
    const { error: svcErr } = await db.from("user_services").insert(rows);
    if (svcErr) return NextResponse.json({ error: svcErr.message }, { status: 500 });
  }

  await track(user.id, "onboarding_completed", {
    picks: loved.length,
    services: services.length,
  });

  return NextResponse.json({ ok: true, saved: loved.length });
}
