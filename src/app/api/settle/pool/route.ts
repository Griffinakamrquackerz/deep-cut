import { NextResponse } from "next/server";
import { z } from "zod";
import { cacheMovie, discoverSettleCandidates, resolveKeywordIds } from "@/lib/tmdb";
import { effectiveObscurity, MIN_LESS_SEEN_OBSCURITY } from "@/lib/obscurity";
import { MIN_RECOMMENDATION_RATING, passesRecommendationRating } from "@/lib/recommendation-quality";
import { currentUser } from "@/lib/supabase/server";
import { regionForRequest, serviceAvailableIn } from "@/lib/region";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { tmdbProviderIds, type Service } from "@/lib/services";

// Genre → representative TMDB keywords, so the couch's discover pull sources by
// tone too (same audit fix as the deal + channels), not just genre.
const GENRE_KEYWORDS: Record<number, string[]> = {
  27: ["supernatural", "slasher"], // horror
  35: ["satire", "dark comedy"], // comedy
  878: ["dystopia", "mind bending"], // sci-fi
  9648: ["twist ending", "mind bending"], // mystery
  53: ["suspense", "cat and mouse"], // thriller
  14: ["surrealism"], // fantasy
  10749: ["love"], // romance
  99: ["based on true story"], // documentary
};

// Public by design — Settle It has no auth. Returns a fresh candidate pool
// from TMDB so verdicts never run dry and posters are native.
const Input = z.object({
  genreIds: z.array(z.number().int().positive()).min(1).max(6),
  obscurityMin: z.number().int().min(1).max(5),
  obscurityMax: z.number().int().min(1).max(5),
  eitherShort: z.boolean(),
  // Channel extras (Just Roll It) — optional so Settle callers are unchanged.
  avoidGenreIds: z.array(z.number().int().positive()).max(8).optional(),
  maxReleaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  minRating: z.number().min(0).max(10).optional(),
  // Starting discover page — lets the channel serve a different slice per
  // tune-in so sibling channels (and repeat visits) don't feel identical.
  pageStart: z.number().int().min(1).max(5).optional(),
  // "Only on my platforms" — filters to films streamable on the signed-in
  // user's services (US, flatrate). Ignored signed-out / no services.
  myServicesOnly: z.boolean().optional(),
});

export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const {
    genreIds,
    eitherShort,
    avoidGenreIds,
    maxReleaseDate,
    minRating,
    pageStart = 1,
  } = parsed.data;
  const effectiveMin = MIN_LESS_SEEN_OBSCURITY;
  const effectiveMax = 5;
  const effectiveRating = Math.max(MIN_RECOMMENDATION_RATING, minRating ?? MIN_RECOMMENDATION_RATING);

  // Resolve the signed-in user's services → TMDB provider ids when they asked
  // for "only on my platforms". Signed out / no services → filter ignored.
  // Hoisted out of the myServicesOnly branch because the REGION is needed
  // either way — it decides which country's catalogue TMDB answers for, and
  // getting that wrong is the bug this parameter exists to fix.
  const user = await currentUser().catch(() => null);
  const region = await regionForRequest(supabaseAdmin(), request, user?.id ?? null);

  let watchProviderIds: number[] | undefined;
  if (parsed.data.myServicesOnly && user) {
    const { data: svc } = await supabaseAdmin()
      .from("user_services")
      .select("service")
      .eq("user_id", user.id);
    // Drop services that don't operate where they are. Somebody who picked
    // Hulu in Chicago and now watches from London would otherwise have their
    // whole filter resolve to nothing on TMDB and see an empty house.
    const mine = (svc ?? [])
      .map((r) => r.service as Service)
      .filter((s) => serviceAvailableIn(s, region));
    const ids = tmdbProviderIds(mine);
    if (ids.length) watchProviderIds = ids;
  }

  try {
    // Two pages, deduped — plenty of depth for a night of re-rolls.
    // Deep-cut requests select like the Roll channel: loved-but-quiet
    // (vote_average.desc). popularity.desc would surface exactly the buzzy
    // films the honest-band filter rejects — sort and filter must agree.
    const common = {
      obscurityMin: effectiveMin,
      obscurityMax: effectiveMax,
      maxRuntime: eitherShort ? 99 : undefined,
      withoutGenreIds: avoidGenreIds,
      releasedBefore: maxReleaseDate,
      minRating: effectiveRating,
      minRuntime: 75,
      sortBy: "vote_average.desc" as const,
      watchProviderIds,
      region,
    };
    // Tone reel: keyword-only pull derived from the requested genres, so the
    // couch surfaces on-tone films the genre net alone would miss.
    const kwNames = [...new Set(genreIds.flatMap((g) => GENRE_KEYWORDS[g] ?? []))];
    const keywordIds = kwNames.length ? await resolveKeywordIds(kwNames) : [];

    const pages = await Promise.all([
      ...[pageStart, pageStart + 1].map((page) =>
        discoverSettleCandidates({ ...common, genreIds, page }),
      ),
      keywordIds.length
        ? discoverSettleCandidates({ ...common, genreIds: [], keywordIds, page: pageStart })
        : Promise.resolve([]),
    ]);
    const seen = new Set<number>();
    // Keep the couch modern-leaning: the vote_average.desc sort favours old
    // acclaimed classics, so cap pre-1970 titles to a few per pool.
    let classicShown = 0;
    const candidates = pages.flat().filter((c) => {
      if (seen.has(c.id) || !c.poster_path) return false;
      seen.add(c.id);
      return true;
    });
    const enriched = await Promise.all(
      candidates.slice(0, 40).map(async (candidate) => ({
        candidate,
        movie: await cacheMovie(candidate.id),
      })),
    );
    const qualified = enriched.filter(({ candidate, movie }) => {
      if (!movie || !passesRecommendationRating({
        id: candidate.id,
        year: candidate.year,
        ratings: movie.ratings,
      })) return false;
      // Include IMDb reach in the fame cap; TMDB alone misses some widely-seen
      // streaming releases with relatively few TMDB votes.
      const obscurity = effectiveObscurity({
        ...candidate,
        imdb_votes: movie.imdb_votes,
      });
      if (obscurity < effectiveMin || obscurity > effectiveMax) return false;
      if (!candidate.genre_ids.some((genreId) => genreIds.includes(genreId))) return false;
      if (candidate.year != null && candidate.year < 1970) {
        if (classicShown >= 3) return false;
        classicShown++;
      }
      return true;
    }).map(({ candidate, movie }) => ({
      ...candidate,
      imdb_votes: movie?.imdb_votes ?? null,
    }));
    return NextResponse.json({ candidates: qualified });
  } catch {
    return NextResponse.json({ error: "discover_failed" }, { status: 502 });
  }
}
