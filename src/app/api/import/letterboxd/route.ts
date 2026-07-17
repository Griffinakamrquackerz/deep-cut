import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cacheMovie, resolveTitleYear, searchMovies } from "@/lib/tmdb";
import { track } from "@/lib/analytics";

export const maxDuration = 60;

// Client chunks the CSV — each call resolves up to 20 films against TMDB.
const ImportInput = z.object({
  rows: z
    .array(
      z.object({
        title: z.string().min(1).max(300),
        year: z.number().int().min(1880).max(2035).nullable(),
        rating: z.number().min(0.5).max(5).nullable(),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
      }),
    )
    .min(1)
    .max(20),
});

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = ImportInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const db = supabaseAdmin();

  // Resolve every row against TMDB in parallel — hallucination-proof, same
  // validation the rec engine uses.
  const resolved = await Promise.all(
    parsed.data.rows.map(async (row) => {
      const tmdbId = row.year
        ? await resolveTitleYear(row.title, row.year).catch(() => null)
        : await searchMovies(row.title)
            .then((r) => r[0]?.id ?? null)
            .catch(() => null);
      if (!tmdbId) return { row, movie: null };
      const movie = await cacheMovie(tmdbId).catch(() => null);
      return { row, movie };
    }),
  );

  const hits = resolved.filter(
    (r): r is { row: (typeof parsed.data.rows)[number]; movie: NonNullable<Awaited<ReturnType<typeof cacheMovie>>> } =>
      r.movie !== null,
  );
  const misses = resolved.filter((r) => r.movie === null).map((r) => r.row.title);

  // Skip watch-log duplicates so re-running an import doesn't double history.
  const hitIds = hits.map((h) => h.movie.id);
  const { data: existingLogs } = hitIds.length
    ? await db.from("watch_logs").select("movie_id").eq("user_id", user.id).in("movie_id", hitIds)
    : { data: [] };
  const alreadyLogged = new Set((existingLogs ?? []).map((r) => r.movie_id as number));

  let lovedAdded = 0;
  let logged = 0;

  for (const { row, movie } of hits) {
    // 4+ stars = a loved film that shapes the taste profile.
    if (row.rating !== null && row.rating >= 4) {
      const { error } = await db
        .from("loved_movies")
        .upsert({ user_id: user.id, movie_id: movie.id });
      if (!error) lovedAdded++;
    }
    // Everything imports into watch history (dated in the past, so it never
    // floods the community marquee) — the engine will never re-deal these.
    if (!alreadyLogged.has(movie.id)) {
      const reaction =
        row.rating === null ? "fine" : row.rating >= 4 ? "loved" : row.rating >= 2.5 ? "fine" : "not_for_me";
      const { error } = await db.from("watch_logs").insert({
        user_id: user.id,
        movie_id: movie.id,
        reaction,
        note: null,
        why: null,
        ...(row.date ? { watched_at: `${row.date}T12:00:00Z` } : {}),
      });
      if (!error) {
        logged++;
        alreadyLogged.add(movie.id);
      }
    }
  }

  await track(user.id, "letterboxd_import_chunk", {
    rows: parsed.data.rows.length,
    matched: hits.length,
    lovedAdded,
  });

  return NextResponse.json({
    matched: hits.length,
    lovedAdded,
    logged,
    misses,
  });
}
