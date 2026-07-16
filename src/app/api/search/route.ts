import { NextResponse } from "next/server";
import { searchMovies } from "@/lib/tmdb";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });
  try {
    const results = await searchMovies(q);
    return NextResponse.json({ results: results.slice(0, 12) });
  } catch {
    return NextResponse.json({ error: "search_failed" }, { status: 502 });
  }
}
