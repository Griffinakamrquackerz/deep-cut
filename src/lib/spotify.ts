// Profile theme music — the legal path. We never host a note of copyrighted
// audio; we auto-match a member's signature film to its soundtrack on Spotify
// and render Spotify's OWN embed player, which carries the licenses. Free:
// a Spotify developer app (Client Credentials flow) costs nothing and has no
// per-play fee. Set SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET to light it up;
// absent, spotifyConfigured() is false and the whole feature no-ops — same
// graceful-degradation contract as Stripe (premiumConfigured) and OMDb.
// Docs: https://developer.spotify.com/documentation/web-api

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";

export function spotifyConfigured(): boolean {
  return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

export type ThemeKind = "track" | "album";

export interface FilmTheme {
  kind: ThemeKind;
  id: string; // Spotify id
  name: string; // track or album name
  artist: string; // primary artist / composer
  /** open.spotify.com embed URL — drop straight into an <iframe>. */
  embedUrl: string;
}

export function embedUrlFor(kind: ThemeKind, id: string): string {
  return `https://open.spotify.com/embed/${kind}/${id}`;
}

// --- token (Client Credentials, cached per warm lambda) ---------------------

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string | null> {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  const now = clock();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) return cachedToken.value;

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    cachedToken = {
      value: data.access_token,
      expiresAt: now + (data.expires_in ?? 3600) * 1000,
    };
    return cachedToken.value;
  } catch {
    return null;
  }
}

// Date.now is unavailable in some sandboxed contexts; guard so imports never throw.
function clock(): number {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

// --- search + match ---------------------------------------------------------

interface SpTrack {
  id: string;
  name: string;
  popularity?: number;
  artists?: Array<{ name: string }>;
  album?: { album_type?: string; name?: string };
}
interface SpAlbum {
  id: string;
  name: string;
  album_type?: string;
  artists?: Array<{ name: string }>;
  total_tracks?: number;
}

async function search(
  token: string,
  q: string,
  type: "track" | "album",
  limit = 10,
): Promise<SpTrack[] | SpAlbum[]> {
  try {
    const res = await fetch(
      `${API_BASE}/search?q=${encodeURIComponent(q)}&type=${type}&limit=${limit}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      tracks?: { items?: SpTrack[] };
      albums?: { items?: SpAlbum[] };
    };
    return type === "track" ? (data.tracks?.items ?? []) : (data.albums?.items ?? []);
  } catch {
    return [];
  }
}

const THEME_WORDS = ["theme", "main title", "main titles", "opening", "overture", "suite", "prologue"];
const SCORE_WORDS = [
  "soundtrack",
  "original motion picture",
  "original score",
  "motion picture score",
  "film score",
  "ost",
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Resolve a film to its best "play the theme" match on Spotify, or null. */
export async function findFilmTheme(title: string, year: number | null): Promise<FilmTheme | null> {
  const token = await getToken();
  if (!token) return null;
  const t = title.trim();
  if (!t) return null;
  const tn = normalize(t);

  // 1) A signature THEME track ("Jaws — Main Title", "The Godfather Theme").
  const trackQs = [`${t} main title`, `${t} theme`, `${t} original motion picture`];
  let bestTrack: { track: SpTrack; score: number } | null = null;
  for (const q of trackQs) {
    const items = (await search(token, q, "track", 10)) as SpTrack[];
    for (const it of items) {
      const nn = normalize(it.name);
      const album = normalize(it.album?.name ?? "");
      // Must reference the film by name somewhere, else it's a false match.
      const mentionsFilm = nn.includes(tn) || album.includes(tn);
      if (!mentionsFilm) continue;
      let score = 0;
      if (THEME_WORDS.some((w) => nn.includes(w))) score += 6;
      if (SCORE_WORDS.some((w) => album.includes(w) || nn.includes(w))) score += 3;
      if (nn.startsWith(tn)) score += 2;
      score += Math.min(3, Math.round((it.popularity ?? 0) / 25));
      if (!bestTrack || score > bestTrack.score) bestTrack = { track: it, score };
    }
    if (bestTrack && bestTrack.score >= 8) break; // strong hit — stop early
  }

  // 2) The soundtrack ALBUM — the whole score to browse.
  let bestAlbum: { album: SpAlbum; score: number } | null = null;
  const albumQs = [`${t} original motion picture soundtrack`, `${t} soundtrack`, `${t} score`];
  for (const q of albumQs) {
    const items = (await search(token, q, "album", 10)) as SpAlbum[];
    for (const it of items) {
      const nn = normalize(it.name);
      if (!nn.includes(tn)) continue; // album must name the film
      let score = 0;
      if (SCORE_WORDS.some((w) => nn.includes(w))) score += 6;
      if (it.album_type === "album") score += 1;
      if ((it.total_tracks ?? 0) >= 8) score += 1;
      if (nn.startsWith(tn)) score += 2;
      if (year && nn.includes(String(year))) score += 1;
      if (!bestAlbum || score > bestAlbum.score) bestAlbum = { album: it, score };
    }
    if (bestAlbum && bestAlbum.score >= 8) break;
  }

  // Prefer a strong single theme track (that's the "play the Jaws theme"
  // moment); otherwise the soundtrack album; otherwise whichever we found.
  const track = bestTrack && bestTrack.score >= 6 ? bestTrack : null;
  const album = bestAlbum && bestAlbum.score >= 6 ? bestAlbum : null;

  if (track && (!album || track.score >= album.score)) {
    return {
      kind: "track",
      id: track.track.id,
      name: track.track.name,
      artist: track.track.artists?.[0]?.name ?? "",
      embedUrl: embedUrlFor("track", track.track.id),
    };
  }
  if (album) {
    return {
      kind: "album",
      id: album.album.id,
      name: album.album.name,
      artist: album.album.artists?.[0]?.name ?? "",
      embedUrl: embedUrlFor("album", album.album.id),
    };
  }
  // Last resort: the top result of either, if anything at all named the film.
  if (bestTrack) {
    return {
      kind: "track",
      id: bestTrack.track.id,
      name: bestTrack.track.name,
      artist: bestTrack.track.artists?.[0]?.name ?? "",
      embedUrl: embedUrlFor("track", bestTrack.track.id),
    };
  }
  if (bestAlbum) {
    return {
      kind: "album",
      id: bestAlbum.album.id,
      name: bestAlbum.album.name,
      artist: bestAlbum.album.artists?.[0]?.name ?? "",
      embedUrl: embedUrlFor("album", bestAlbum.album.id),
    };
  }
  return null;
}

export interface ThemeCandidate {
  kind: ThemeKind;
  id: string;
  name: string;
  artist: string;
}

/** Free-text search for the owner's "not it? pick the track" override. */
export async function searchThemeCandidates(q: string): Promise<ThemeCandidate[]> {
  const token = await getToken();
  if (!token || !q.trim()) return [];
  const [tracks, albums] = await Promise.all([
    search(token, q, "track", 6) as Promise<SpTrack[]>,
    search(token, q, "album", 4) as Promise<SpAlbum[]>,
  ]);
  const out: ThemeCandidate[] = [];
  for (const it of tracks) {
    out.push({ kind: "track", id: it.id, name: it.name, artist: it.artists?.[0]?.name ?? "" });
  }
  for (const it of albums) {
    out.push({ kind: "album", id: it.id, name: it.name, artist: it.artists?.[0]?.name ?? "" });
  }
  return out;
}
