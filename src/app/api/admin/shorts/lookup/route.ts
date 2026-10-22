import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { fetchOEmbed, parseVideoUrl } from "@/lib/video-url";

// Paste a Vimeo or YouTube link, get back what the platform will say about it
// for free — title, uploader, thumbnail, and (Vimeo only) runtime. No API key
// on either side: both platforms' oEmbed endpoints are public. This is the
// whole "search" a filmmaker's own submitted link needs; true catalogue search
// (typing a title and getting candidates back) is the separate /search route,
// gated on whether an API key for that platform is configured.

const Input = z.object({ url: z.string().trim().min(1).max(2000) });

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const video = parseVideoUrl(parsed.data.url);
  if (!video) {
    return NextResponse.json(
      { error: "unrecognised_url", note: "That doesn't look like a Vimeo or YouTube link." },
      { status: 400 },
    );
  }

  const meta = await fetchOEmbed(video);
  if (!meta) {
    return NextResponse.json(
      {
        error: "lookup_failed",
        note: "The platform didn't answer — the video may be private, deleted, or region-locked.",
        source: video.source,
        videoId: video.videoId,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    source: video.source,
    videoId: video.videoId,
    title: meta.title,
    director: meta.author,
    runtimeSec: meta.runtimeSec,
    thumb: meta.thumb,
  });
}
