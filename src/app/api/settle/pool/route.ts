import { NextResponse } from "next/server";
import { z } from "zod";
import { discoverSettleCandidates } from "@/lib/tmdb";

// Public by design — Settle It has no auth. Returns a fresh candidate pool
// from TMDB so verdicts never run dry and posters are native.
const Input = z.object({
  genreIds: z.array(z.number().int().positive()).min(1).max(6),
  obscurityMin: z.number().int().min(1).max(5),
  obscurityMax: z.number().int().min(1).max(5),
  eitherShort: z.boolean(),
});

export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { genreIds, obscurityMin, obscurityMax, eitherShort } = parsed.data;

  try {
    // Two pages, deduped — plenty of depth for a night of re-rolls.
    const pages = await Promise.all(
      [1, 2].map((page) =>
        discoverSettleCandidates({
          genreIds,
          obscurityMin,
          obscurityMax,
          maxRuntime: eitherShort ? 99 : undefined,
          page,
        }),
      ),
    );
    const seen = new Set<number>();
    const candidates = pages.flat().filter((c) => {
      if (seen.has(c.id) || !c.poster_path) return false;
      seen.add(c.id);
      return true;
    });
    return NextResponse.json({ candidates });
  } catch {
    return NextResponse.json({ error: "discover_failed" }, { status: 502 });
  }
}
