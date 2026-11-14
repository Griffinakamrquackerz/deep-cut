import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { programmeShowing } from "@/lib/shorts-admin";
import { readPlayability, type Verdict } from "@/lib/playability";

// Is every film on the bill actually playable?
//
// Kung Fury sat on Channel 14 for weeks after a migration had archived it: the
// archive ran before the insert that created it, so the update matched nothing
// and the insert put it straight back on air. Neither statement errored. The
// only way anyone found out was tuning to the channel and getting an error
// where a film should be.
//
// A channel guide that lists something unplayable is worse than a shorter
// guide, so this asks the platforms directly, film by film:
//
//   Vimeo   — oEmbed carries domain_status_code, which is 403 when the owner
//             has blocked embedding on our domain. A film can be public on
//             vimeo.com and still refuse to play here.
//   YouTube — oEmbed is no use: it answers happily for an age-gated video,
//             which is exactly the failure that bites. So this asks the player
//             what it would actually do — through the Data API when a key is
//             set, otherwise the same public endpoint the site itself uses.
//
// Read-only. It reports; taking a film off air stays a decision, not something
// a background job does on a flaky network.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Check {
  id: string;
  title: string;
  channels: string[];
  source: "vimeo" | "youtube";
  videoId: string;
  verdict: Verdict;
  detail: string;
}

async function checkVimeo(videoId: string): Promise<{ verdict: Verdict; detail: string }> {
  const url = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${videoId}`)}`;
  const res = await fetch(url).catch(() => null);
  if (!res) return { verdict: "unknown", detail: "couldn't reach Vimeo" };
  if (res.status === 404) return { verdict: "gone", detail: "no such video" };
  if (!res.ok) return { verdict: "unknown", detail: `oEmbed ${res.status}` };

  const data = (await res.json().catch(() => null)) as { domain_status_code?: number } | null;
  // The one that matters: public on Vimeo, blocked on our domain.
  if (data?.domain_status_code && data.domain_status_code !== 200) {
    return {
      verdict: "blocked",
      detail: `embedding refused on thedeepcut.xyz (${data.domain_status_code})`,
    };
  }
  return { verdict: "ok", detail: "embeds fine" };
}

/** The Data API, when a key is configured — supported, and the clearest answer. */
async function youTubeViaApi(
  videoId: string,
  key: string,
): Promise<{ verdict: Verdict; detail: string } | null> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,status&id=${videoId}&key=${key}`,
  ).catch(() => null);
  if (!res?.ok) return null; // fall through to the keyless probe

  const data = (await res.json().catch(() => null)) as {
    items?: Array<{
      contentDetails?: { contentRating?: { ytRating?: string } };
      status?: { embeddable?: boolean };
    }>;
  } | null;

  const item = data?.items?.[0];
  if (!item) return { verdict: "gone", detail: "no such video" };
  if (item.contentDetails?.contentRating?.ytRating === "ytAgeRestricted") {
    return { verdict: "age_restricted", detail: "age-gated — will not play embedded" };
  }
  if (item.status?.embeddable === false) {
    return { verdict: "blocked", detail: "embedding disabled by the owner" };
  }
  return { verdict: "ok", detail: "plays" };
}

// The public web client key. Not a secret — it ships in every youtube.com page
// — and it's what the keyless path uses when no Data API key is configured.
const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

async function checkYouTube(videoId: string): Promise<{ verdict: Verdict; detail: string }> {
  const key = process.env.YOUTUBE_API_KEY;
  if (key) {
    const viaApi = await youTubeViaApi(videoId, key);
    if (viaApi) return viaApi;
  }

  // Keyless: ask the player what it would do. oEmbed is no use here — it
  // answers happily for an age-gated video, which is exactly the failure that
  // put Kung Fury on air for weeks.
  const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      videoId,
      context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00" } },
    }),
  }).catch(() => null);
  if (!res?.ok) return { verdict: "unknown", detail: "couldn't reach YouTube" };

  const data = (await res.json().catch(() => null)) as {
    playabilityStatus?: { status?: string; reason?: string };
  } | null;
  const ps = data?.playabilityStatus;
  if (!ps?.status) return { verdict: "unknown", detail: "no playability answer" };
  return readPlayability(ps.status, ps.reason ?? "");
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const films = await programmeShowing().catch(() => []);

  const checks: Check[] = [];
  for (const f of films) {
    const r =
      f.source === "vimeo" ? await checkVimeo(f.videoId) : await checkYouTube(f.videoId);
    checks.push({
      id: f.id,
      title: f.title,
      channels: f.channels,
      source: f.source,
      videoId: f.videoId,
      verdict: r.verdict,
      detail: r.detail,
    });
  }

  const bad = checks.filter((c) => c.verdict !== "ok" && c.verdict !== "unknown");
  return NextResponse.json({
    checked: checks.length,
    // The headline: what a viewer would hit an error on right now.
    broken: bad.length,
    problems: bad,
    // Separated on purpose — a network blip on our side isn't a broken film,
    // and treating it as one would archive good films on a bad afternoon.
    unknown: checks.filter((c) => c.verdict === "unknown").length,
    all: checks,
  });
}
