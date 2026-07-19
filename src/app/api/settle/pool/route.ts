import { NextResponse } from "next/server";
import { z } from "zod";
import { discoverSettleCandidates } from "@/lib/tmdb";
import { effectiveObscurity } from "@/lib/obscurity";

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
});

export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const {
    genreIds,
    obscurityMin,
    obscurityMax,
    eitherShort,
    avoidGenreIds,
    maxReleaseDate,
    minRating,
    pageStart = 1,
  } = parsed.data;

  try {
    // Two pages, deduped — plenty of depth for a night of re-rolls.
    const pages = await Promise.all(
      [pageStart, pageStart + 1].map((page) =>
        discoverSettleCandidates({
          genreIds,
          obscurityMin,
          obscurityMax,
          maxRuntime: eitherShort ? 99 : undefined,
          withoutGenreIds: avoidGenreIds,
          releasedBefore: maxReleaseDate,
          minRating,
          page,
        }),
      ),
    );
    const seen = new Set<number>();
    const candidates = pages.flat().filter((c) => {
      if (seen.has(c.id) || !c.poster_path) return false;
      // Honest band: fame-capped obscurity must fit what the couch asked for —
      // a buzzy new release can't sneak into a deep-cut standoff on low votes.
      const eo = effectiveObscurity(c);
      if (eo < obscurityMin || eo > obscurityMax) return false;
      seen.add(c.id);
      return true;
    });
    return NextResponse.json({ candidates });
  } catch {
    return NextResponse.json({ error: "discover_failed" }, { status: 502 });
  }
}
