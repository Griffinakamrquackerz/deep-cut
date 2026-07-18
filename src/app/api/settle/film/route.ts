import { NextResponse } from "next/server";
import { getMovieDetails, getMovieTrailer, getWatchProviders } from "@/lib/tmdb";
import { getOmdbRatings } from "@/lib/omdb";
import { SERVICE_LABELS, type Service } from "@/lib/services";

// Public: enrich a single shown verdict film with real runtime, US streaming,
// its best YouTube trailer, and ratings (IMDb/RT via OMDb, TMDB baseline).
export async function GET(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }
  try {
    const [details, services, trailer] = await Promise.all([
      getMovieDetails(id).catch(() => null),
      getWatchProviders(id).catch(() => [] as Service[]),
      getMovieTrailer(id).catch(() => null),
    ]);
    // IMDb + Rotten Tomatoes need the imdb_id from details (OMDb key optional).
    const omdb = details?.imdb_id
      ? await getOmdbRatings(details.imdb_id).catch(() => ({ imdb: null, rt: null }))
      : { imdb: null, rt: null };
    return NextResponse.json({
      runtime: details?.runtime ?? null,
      streaming: services.map((s) => SERVICE_LABELS[s]),
      trailerKey: trailer?.key ?? null,
      ratings: { tmdb: details?.vote_average ?? null, imdb: omdb.imdb, rt: omdb.rt },
    });
  } catch {
    return NextResponse.json({ runtime: null, streaming: [], trailerKey: null, ratings: null });
  }
}
