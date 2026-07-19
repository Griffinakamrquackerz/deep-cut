import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { recordTasteSignal } from "@/lib/signals";
import { cacheMovie } from "@/lib/tmdb";
import { checkAndIncrement } from "@/lib/rate-limit";
import { isAdminEmail } from "@/lib/admin";

const Input = z.object({
  movieId: z.number().int().positive(),
  source: z.enum(["roll_pick", "settle_verdict"]), // client-fired sparks only;
  // hot_take / take_fire are recorded server-side inside the takes routes.
});

/** Fire-and-forget taste spark from Roll/Settle taps. Guests 401 silently. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  if (!isAdminEmail(user.email)) {
    const allowed = await checkAndIncrement(user.id, "taste_signal", 200);
    if (!allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // Cache the film so the signal can join to a title later (Roll/Settle films
  // may not be in the vault yet).
  const movie = await cacheMovie(parsed.data.movieId).catch(() => null);
  if (!movie) return NextResponse.json({ error: "unknown_movie" }, { status: 400 });

  await recordTasteSignal(supabaseAdmin(), user.id, movie.id, parsed.data.source);
  return NextResponse.json({ ok: true });
}
