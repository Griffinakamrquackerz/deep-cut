import { NextResponse } from "next/server";
import { getMovieDetails, getWatchProviders } from "@/lib/tmdb";
import { SERVICE_LABELS, type Service } from "@/lib/services";

// Public: enrich a single shown verdict film with real runtime + US streaming.
// Called only for the film on screen, so it stays to one round-trip.
export async function GET(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }
  try {
    const [details, services] = await Promise.all([
      getMovieDetails(id).catch(() => null),
      getWatchProviders(id).catch(() => [] as Service[]),
    ]);
    return NextResponse.json({
      runtime: details?.runtime ?? null,
      streaming: services.map((s) => SERVICE_LABELS[s]),
    });
  } catch {
    return NextResponse.json({ runtime: null, streaming: [] });
  }
}
