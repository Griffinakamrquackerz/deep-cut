import { NextResponse } from "next/server";
import { z } from "zod";
import { blendMovies } from "@/lib/blend";
import { currentUser } from "@/lib/supabase/server";
import { recordTasteSignal } from "@/lib/signals";
import { supabaseAdmin } from "@/lib/supabase/admin";

// "This Meets That" — POST 2-3 TMDB movie ids, get the offspring back.
// Public like the other two games (Settle It, Just Roll It): no account needed
// to play. When someone IS signed in, the parents they chose are recorded as
// soft taste sparks — naming three films you love says a lot.

export const maxDuration = 45; // one LLM round + TMDB validation

const Input = z.object({
  movieIds: z.array(z.number().int().positive()).min(2).max(3),
});

export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  // Same film twice is not a blend.
  const movieIds = [...new Set(parsed.data.movieIds)];
  if (movieIds.length < 2) {
    return NextResponse.json({ error: "need_two_different" }, { status: 400 });
  }

  const debug = new URL(request.url).searchParams.get("debug") === "1";

  try {
    const { seeds, picks, llm } = await blendMovies(movieIds);
    if (!seeds.length) return NextResponse.json({ error: "unknown_films" }, { status: 404 });

    // Signed-in players: the parents are a strong taste signal. Fire-and-forget.
    void (async () => {
      const user = await currentUser().catch(() => null);
      if (!user) return;
      const db = supabaseAdmin();
      for (const s of seeds) {
        await recordTasteSignal(db, user.id, s.id, "blend_parent").catch(() => null);
      }
    })();

    // An all-vault result is indistinguishable from a good one out here, so
    // ?debug=1 reports whether the smart pass actually ran.
    return NextResponse.json(debug ? { seeds, picks, llm } : { seeds, picks });
  } catch (err) {
    console.error("blend failed", err);
    return NextResponse.json({ error: "splice_failed" }, { status: 502 });
  }
}
