import { NextResponse } from "next/server";
import { z } from "zod";
import { discoverSettleCandidates, resolveKeywordIds, searchMovies } from "@/lib/tmdb";
import { vibeByKey, VIBE_KEYS } from "@/lib/vibes";
import { HOUSE_CANON, pickCanonHit, type CanonPick } from "@/lib/canon";
import { effectiveObscurity } from "@/lib/obscurity";
import { currentUser } from "@/lib/supabase/server";
import { regionForRequest, serviceAvailableIn } from "@/lib/region";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { tmdbProviderIds, type Service } from "@/lib/services";

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
  // "Only on my platforms" — filters the discover reels to films streamable on
  // the signed-in user's services (US, flatrate). Ignored when signed out or
  // when the user has no services saved.
  myServicesOnly: z.boolean().optional(),
});

const CANON_PER_POOL = 7;

// House rule: Bollywood/regional Indian cinema enters via the programmer's
// shelf (a hand-picked international classic) or not at all. Home-audience
// devotion inflates ratings enough to game the most-loved-least-seen sort,
// flooding unrelated channels with regional crowd-pleasers.
const CANON_ONLY_LANGS = new Set(["hi", "ta", "te", "ml", "kn", "bn", "pa", "mr"]);

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
  // An exact title inside the year band beats a more popular near-match — the
  // Scare shelf's "House" (Hausu) otherwise resolves to Animal House.
  const match = pickCanonHit(results, pick);
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

  // "Only on my platforms": resolve the signed-in user's services to TMDB
  // provider ids. Signed out / no services → the filter is simply ignored.
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
  const filtering = !!watchProviderIds;

  const cutoff = new Date(Date.now() - 548 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // The hand-programmed canon shelf has no streaming data, so under a
  // platforms filter we lean entirely on the provider-filtered discover reels —
  // everything shown is then genuinely watchable on what you pay for.
  const shelf = filtering ? [] : HOUSE_CANON[vibeKey] ?? [];
  const picks = shelf
    .slice()
    .sort(() => Math.random() - 0.5)
    .slice(0, CANON_PER_POOL);

  // Recent-gems window: released in the last ~12 years but before the 18-month
  // gate. The all-time (vote_average.desc) reel skews old — acclaimed classics
  // carry the highest ratings — so we pull a dedicated modern reel and splice
  // it in, keeping the channel from feeling like a museum.
  const modernFloor = new Date(Date.now() - 12 * 365 * 86_400_000).toISOString().slice(0, 10);
  const common = {
    genreIds: vibe.rollGenreIds ?? vibe.genreIds,
    withoutGenreIds: vibe.avoidGenreIds,
    obscurityMin: 3,
    obscurityMax: 5,
    minRating: 6.5,
    minRuntime: 75,
    sortBy: "vote_average.desc" as const,
    region,
  };

  // Tone reel: for tone channels (mind, weird, laugh…), a keyword-only pull
  // catches on-tone films no genre net would — the surreal Drama that isn't
  // "sci-fi". Kept in-tone by the channel's avoid-genres. Empty if no keywords.
  const keywordIds = vibe.keywords?.length ? await resolveKeywordIds(vibe.keywords) : [];

  try {
    const [canonResolved, timeless, modern, toned] = await Promise.all([
      Promise.all(picks.map(resolveCanon)),
      discoverSettleCandidates({ ...common, releasedBefore: cutoff, page: pageStart, watchProviderIds }),
      discoverSettleCandidates({
        ...common,
        releasedAfter: modernFloor,
        releasedBefore: cutoff,
        page: pageStart,
        watchProviderIds,
      }),
      keywordIds.length
        ? discoverSettleCandidates({
            ...common,
            genreIds: [], // keyword-only: reach off-genre tone gems
            keywordIds,
            releasedBefore: cutoff,
            page: pageStart,
            watchProviderIds,
          })
        : Promise.resolve([]),
    ]);

    // Interleave modern + timeless + tone so no reel buries the others.
    const reel: typeof timeless = [];
    for (let i = 0; i < Math.max(modern.length, timeless.length, toned.length); i++) {
      if (toned[i]) reel.push(toned[i]);
      if (modern[i]) reel.push(modern[i]);
      if (timeless[i]) reel.push(timeless[i]);
    }

    const seen = new Set<number>();
    const candidates: Candidate[] = [];
    for (const c of canonResolved) {
      if (c && !seen.has(c.id)) {
        seen.add(c.id);
        candidates.push(c);
      }
    }
    // Cap pre-1970 titles in the algorithmic reel so the channel stays modern
    // (the curated canon shelf above is exempt — that's the repertory point).
    let classicShown = 0;
    for (const c of reel) {
      if (seen.has(c.id) || !c.poster_path) continue;
      if (CANON_ONLY_LANGS.has(c.original_language)) continue;
      // Genre-defining channels (laugh→Comedy, scare→Horror) must actually BE
      // that genre — the keyword-only reel can otherwise surface a film that
      // merely shares a tag (a "satire" drama sneaking onto Make me laugh).
      if (
        vibe.requireGenreIds?.length &&
        !vibe.requireGenreIds.some((g) => c.genre_ids.includes(g))
      )
        continue;
      if (c.year != null && c.year < 1970 && classicShown >= 2) continue;
      // Fame caps the reel: a film buzzing right now isn't a deep cut this
      // month, whatever its vote count says. (House picks are exempt — a
      // canon classic stays canon even when it trends.)
      if (effectiveObscurity(c) < 3) continue;
      // Quality bar, any passport: a genuinely great non-English film travels
      // (1000+ votes = international reach); a home-crowd favorite with an
      // inflated rating doesn't. Low-vote masterpieces ride the canon shelf.
      if (c.original_language !== "en" && c.vote_count < 1000) continue;
      // Time is the other judge: an old film with a high rating earned it, a
      // recent one needs real reach — fan-bombed ratings cluster in the last
      // decade (Gabriel's Inferno tier). Recent low-vote gems ride the canon.
      if (c.year && c.year >= new Date().getFullYear() - 10 && c.vote_count < 3000) continue;
      seen.add(c.id);
      if (c.year != null && c.year < 1970) classicShown++;
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
