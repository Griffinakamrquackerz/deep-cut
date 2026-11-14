import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cacheMovie } from "@/lib/tmdb";
import { clearTonight, getTonight, setTonight } from "@/lib/tonight";
import { track } from "@/lib/analytics";

// What you're watching tonight. PUT says, DELETE takes it back, GET reads
// your own (the Lobby reads everyone else's through the feed).

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const plan = await getTonight(supabaseAdmin(), user.id).catch(() => null);
  return NextResponse.json({ plan });
}

const Input = z.object({
  movieId: z.number().int().positive(),
  note: z.string().trim().max(140).optional(),
});

export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  // The row points at public.movies, so the film has to be in the cache before
  // it can be pointed at — otherwise the insert trips a foreign key on a film
  // nobody has looked at yet.
  const movie = await cacheMovie(parsed.data.movieId).catch(() => null);
  if (!movie) return NextResponse.json({ error: "unknown_film" }, { status: 404 });

  const plan = await setTonight(
    supabaseAdmin(),
    user.id,
    parsed.data.movieId,
    parsed.data.note ?? null,
  ).catch(() => null);
  if (!plan) {
    return NextResponse.json(
      { error: "save_failed", note: "Run supabase/migrations/0012_social.sql." },
      { status: 500 },
    );
  }

  await track(user.id, "tonight_set", { movieId: parsed.data.movieId });
  return NextResponse.json({ ok: true, plan });
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await clearTonight(supabaseAdmin(), user.id);
  return NextResponse.json({ ok: true });
}
