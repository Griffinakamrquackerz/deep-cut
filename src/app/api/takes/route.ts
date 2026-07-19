import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createTake, deleteTake, listTakes, TAKE_MAX } from "@/lib/takes";
import { cacheMovie } from "@/lib/tmdb";
import { checkAndIncrement } from "@/lib/rate-limit";
import { isAdminEmail } from "@/lib/admin";
import { track } from "@/lib/analytics";
import { recordTasteSignal } from "@/lib/signals";

/** List takes — public (movie pages are crawlable; takes are content). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const movieId = Number(url.searchParams.get("movieId"));
  const user = await currentUser();
  const takes = await listTakes(supabaseAdmin(), {
    movieId: Number.isInteger(movieId) && movieId > 0 ? movieId : undefined,
    viewerId: user?.id ?? null,
  });
  return NextResponse.json({ takes });
}

const CreateInput = z.object({
  movieId: z.number().int().positive(),
  body: z.string().trim().min(2).max(TAKE_MAX),
});

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = CreateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  // The wall stays spicy, not spammy — 15 takes a day is plenty of nitrate.
  if (!isAdminEmail(user.email)) {
    const allowed = await checkAndIncrement(user.id, "hot_take", 15);
    if (!allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // Ensure the film exists in the vault (also powers the poster on the card).
  const movie = await cacheMovie(parsed.data.movieId).catch(() => null);
  if (!movie) return NextResponse.json({ error: "unknown_movie" }, { status: 400 });

  const created = await createTake(supabaseAdmin(), user.id, movie.id, parsed.data.body);
  if (!created) return NextResponse.json({ error: "create_failed" }, { status: 500 });

  await track(user.id, "hot_take_posted", { movieId: movie.id });
  // Writing about a film is engagement — a soft spark for the taste engine.
  await recordTasteSignal(supabaseAdmin(), user.id, movie.id, "hot_take");
  return NextResponse.json({ ok: true, id: created.id });
}

export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const ok = await deleteTake(supabaseAdmin(), id, user.id, isAdminEmail(user.email));
  if (!ok) return NextResponse.json({ error: "not_found_or_not_yours" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
