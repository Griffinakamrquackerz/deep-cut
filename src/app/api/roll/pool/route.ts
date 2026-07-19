import { NextResponse } from "next/server";
import { z } from "zod";
import { discoverSettleCandidates, searchMovies } from "@/lib/tmdb";
import { vibeByKey, VIBE_KEYS } from "@/lib/vibes";
import { HOUSE_CANON, type CanonPick } from "@/lib/canon";

export const maxDuration = 30;

// The channel's projector. Two reels spliced together:
//  1. House canon — the hand-programmed cinephile shelf (artists' favorite
//     artists), ~10 random picks resolved against TMDB by title+year.
//  2. Hidden-gem discover — most-loved-least-seen (vote_average.desc inside
//     the 200–8000-vote band), 18-month age gate, 6.5 rating floor, channel
//     tone exclusions.
// Public like the rest of Roll/Settle.

const Input = z.object({
  vibe: z.enum(VIBE_KEYS),
  pageStart: z.number().int().min(1).max(5).optional(),
});

const CANON_PER_POOL = 10;

interface Candidate {
  id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  overview: string;
  canon?: boolean;
}

// Title+year → resolved candidate. Canon titles don't move; cache per instance.
const canonCache = new Map<string, Candidate | null>();

async function resolveCanon(pick: CanonPick): Promise<Candidate | null> {
  const key = `${pick.t}|${pick.y}`;
  const hit = canonCache.get(key);
  if (hit !== undefined) return hit;
  const results = await searchMovies(pick.t).catch(() => []);
  const match =
    results.find((r) => r.year != null && Math.abs(r.year - pick.y) <= 1 && r.poster_path) ?? null;
  const candidate: Candidate | null = match
    ? {
        id: match.id,
        title: match.title,
        year: match.year,
        poster_path: match.poster_path,
        overview: match.overview ?? "",
        canon: true,
      }
    : null;
  canonCache.set(key, candidate);
  return candidate;
}

export async function POST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { vibe: vibeKey, pageStart = 1 } = parsed.data;
  const vibe = vibeByKey(vibeKey);
  if (!vibe) return NextResponse.json({ error: "unknown_channel" }, { status: 400 });

  const cutoff = new Date(Date.now() - 548 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const shelf = HOUSE_CANON[vibeKey] ?? [];
  const picks = shelf
    .slice()
    .sort(() => Math.random() - 0.5)
    .slice(0, CANON_PER_POOL);

  try {
    const [canonResolved, ...pages] = await Promise.all([
      Promise.all(picks.map(resolveCanon)),
      ...[pageStart, pageStart + 1].map((page) =>
        discoverSettleCandidates({
          genreIds: vibe.rollGenreIds ?? vibe.genreIds,
          withoutGenreIds: vibe.avoidGenreIds,
          obscurityMin: 3,
          obscurityMax: 5,
          releasedBefore: cutoff,
          minRating: 6.5,
          minRuntime: 75,
          sortBy: "vote_average.desc",
          page,
        }),
      ),
    ]);

    const seen = new Set<number>();
    const candidates: Candidate[] = [];
    for (const c of canonResolved) {
      if (c && !seen.has(c.id)) {
        seen.add(c.id);
        candidates.push(c);
      }
    }
    for (const c of pages.flat()) {
      if (seen.has(c.id) || !c.poster_path) continue;
      seen.add(c.id);
      candidates.push({
        id: c.id,
        title: c.title,
        year: c.year,
        poster_path: c.poster_path,
        overview: c.overview,
      });
    }
    return NextResponse.json({ candidates });
  } catch {
    return NextResponse.json({ error: "channel_static" }, { status: 502 });
  }
}
