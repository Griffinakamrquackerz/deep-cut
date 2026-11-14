// Catalogue search — typing a title and getting candidates back, rather than
// already having a link in hand. Unlike oEmbed lookup this needs a key on
// each platform's side, so it's progressive: configured() says whether a given
// platform is wired, and the admin route 400s cleanly on the one that isn't
// rather than the search box just silently doing nothing.

export interface SearchCandidate {
  source: "vimeo" | "youtube";
  videoId: string;
  title: string;
  director: string;
  thumb: string | null;
  runtimeSec: number | null;
}

export function searchConfigured() {
  return {
    vimeo: !!process.env.VIMEO_ACCESS_TOKEN,
    youtube: !!process.env.YOUTUBE_API_KEY,
  };
}

async function searchVimeo(query: string): Promise<SearchCandidate[]> {
  const token = process.env.VIMEO_ACCESS_TOKEN;
  if (!token) return [];
  const url = `https://api.vimeo.com/videos?query=${encodeURIComponent(query)}&per_page=12&fields=uri,name,duration,pictures.sizes,user.name`;
  const res = await fetch(url, {
    headers: { Authorization: `bearer ${token}`, Accept: "application/vnd.vimeo.*+json;version=3.4" },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res?.ok) return [];
  const data = await res.json().catch(() => null);
  const items = Array.isArray(data?.data) ? data.data : [];
  return items.map((v: Record<string, unknown>): SearchCandidate => {
    const uri = typeof v.uri === "string" ? v.uri : "";
    const sizes = (v.pictures as { sizes?: { link?: string }[] } | undefined)?.sizes ?? [];
    return {
      source: "vimeo",
      videoId: uri.replace("/videos/", ""),
      title: typeof v.name === "string" ? v.name : "",
      director: (v.user as { name?: string } | undefined)?.name ?? "",
      thumb: sizes.length ? (sizes[sizes.length - 1].link ?? null) : null,
      runtimeSec: typeof v.duration === "number" ? v.duration : null,
    };
  });
}

/** "PT4M13S" → 253. YouTube's contentDetails carries duration in this form. */
function parseIsoDuration(iso: string): number | null {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const [, h, min, s] = m;
  return (Number(h) || 0) * 3600 + (Number(min) || 0) * 60 + (Number(s) || 0);
}

async function searchYouTube(query: string): Promise<SearchCandidate[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=12&q=${encodeURIComponent(query)}&key=${key}`;
  const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!searchRes?.ok) return [];
  const searchData = await searchRes.json().catch(() => null);
  const items: { id?: { videoId?: string }; snippet?: Record<string, unknown> }[] =
    searchData?.items ?? [];
  const ids = items.map((i) => i.id?.videoId).filter((v): v is string => !!v);
  if (!ids.length) return [];

  // A second call for duration — search results don't carry it.
  const detailUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids.join(",")}&key=${key}`;
  const detailRes = await fetch(detailUrl, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  const detailData = detailRes?.ok ? await detailRes.json().catch(() => null) : null;
  const durations = new Map<string, number | null>();
  for (const d of detailData?.items ?? []) {
    const dur = d?.contentDetails?.duration;
    durations.set(d.id, typeof dur === "string" ? parseIsoDuration(dur) : null);
  }

  return items
    .filter((i) => i.id?.videoId)
    .map((i): SearchCandidate => {
      const videoId = i.id!.videoId!;
      const snippet = i.snippet ?? {};
      const thumbs = snippet.thumbnails as Record<string, { url?: string }> | undefined;
      return {
        source: "youtube",
        videoId,
        title: typeof snippet.title === "string" ? snippet.title : "",
        director: typeof snippet.channelTitle === "string" ? snippet.channelTitle : "",
        thumb: thumbs?.medium?.url ?? thumbs?.default?.url ?? null,
        runtimeSec: durations.get(videoId) ?? null,
      };
    });
}

export async function searchCatalogue(
  source: "vimeo" | "youtube",
  query: string,
): Promise<SearchCandidate[]> {
  return source === "vimeo" ? searchVimeo(query) : searchYouTube(query);
}
