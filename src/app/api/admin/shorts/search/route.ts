import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { searchCatalogue, searchConfigured } from "@/lib/video-search";

// Type a title, get candidates back from Vimeo's or YouTube's own catalogue.
// Progressive: 400s with which key is missing rather than returning an empty
// list that looks like "no results" when it's really "not wired up yet".

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const source = searchParams.get("source");
  if (source !== "vimeo" && source !== "youtube") {
    return NextResponse.json({ error: "bad_source" }, { status: 400 });
  }
  if (!q) return NextResponse.json({ results: [] });

  const configured = searchConfigured();
  if (!configured[source]) {
    return NextResponse.json(
      {
        error: "not_configured",
        note:
          source === "vimeo"
            ? "VIMEO_ACCESS_TOKEN isn't set — paste a Vimeo link instead, or add the key to search by title."
            : "YOUTUBE_API_KEY isn't set — paste a YouTube link instead, or add the key to search by title.",
      },
      { status: 400 },
    );
  }

  const results = await searchCatalogue(source, q).catch(() => []);
  return NextResponse.json({ results });
}
