// Pulling a platform + video ID out of whatever URL someone actually pastes.
//
// Nobody hands you the bare ID — they hand you the address bar. A filmmaker
// sends "https://vimeo.com/887931553", a link they copied from the Vimeo app
// carries a hash ("...?share=copy"), someone forwards the player embed URL
// instead of the page. All of it needs to resolve to the same (source, id)
// pair the rest of the programme is keyed on.

export interface ParsedVideoUrl {
  source: "vimeo" | "youtube";
  videoId: string;
}

/** Vimeo IDs are plain digits, wherever they show up in the URL. */
function parseVimeo(u: URL): string | null {
  const m = u.pathname.match(/(?:^|\/)(?:video\/)?(\d{6,12})(?:\/|$)/);
  return m ? m[1] : null;
}

/** YouTube's 11-character ID, from any of the shapes it travels under. */
function parseYouTube(u: URL): string | null {
  if (u.hostname.includes("youtu.be")) {
    const id = u.pathname.replace(/^\//, "").split("/")[0];
    return /^[\w-]{11}$/.test(id) ? id : null;
  }
  const v = u.searchParams.get("v");
  if (v && /^[\w-]{11}$/.test(v)) return v;
  const m = u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{11})/);
  return m ? m[1] : null;
}

/** Returns null for anything that isn't a Vimeo or YouTube URL it recognises. */
export function parseVideoUrl(raw: string): ParsedVideoUrl | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const videoId = parseVimeo(u);
    return videoId ? { source: "vimeo", videoId } : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "youtu.be") {
    const videoId = parseYouTube(u);
    return videoId ? { source: "youtube", videoId } : null;
  }
  return null;
}

export interface OEmbedResult {
  title: string;
  author: string;
  thumb: string | null;
  /** Seconds, when the platform's oEmbed says — Vimeo does, YouTube doesn't. */
  runtimeSec: number | null;
}

/**
 * The metadata a paste-and-lookup gets for free, no API key required. Both
 * platforms' oEmbed endpoints are public; the trade is that YouTube's doesn't
 * carry a duration, so that field comes back null and stays admin-entered.
 */
export async function fetchOEmbed(parsed: ParsedVideoUrl): Promise<OEmbedResult | null> {
  const endpoint =
    parsed.source === "vimeo"
      ? `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${parsed.videoId}`)}`
      : `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${parsed.videoId}`)}`;

  const res = await fetch(endpoint, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data) return null;

  return {
    title: typeof data.title === "string" ? data.title : "",
    author: typeof data.author_name === "string" ? data.author_name : "",
    thumb: typeof data.thumbnail_url === "string" ? data.thumbnail_url : null,
    runtimeSec: typeof data.duration === "number" ? Math.round(data.duration) : null,
  };
}
