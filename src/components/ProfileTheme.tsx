"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { sfxPop } from "@/lib/sfx";

// The profile turntable — a spinning-vinyl UI wrapped around Spotify's own
// embed. We host zero audio; Spotify's IFrame API drives a hidden player and
// reports play/pause, and our record spins + the tonearm drops in sync. The
// theme arms itself and fades in on the visitor's first tap anywhere (browsers
// forbid true autoplay-with-sound), and tapping the record toggles playback.

interface Match {
  kind: "track" | "album";
  id: string;
  name: string;
  artist: string;
}

// --- Spotify IFrame API loader (singleton across the SPA) -------------------

interface SpotifyController {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  loadUri: (uri: string) => void;
  destroy: () => void;
  addListener: (event: string, cb: (e: { data: { isPaused: boolean } }) => void) => void;
}
interface SpotifyIFrameAPI {
  createController: (
    el: HTMLElement,
    opts: { uri: string; width: string | number; height: string | number },
    cb: (controller: SpotifyController) => void,
  ) => void;
}
declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: SpotifyIFrameAPI) => void;
    __spotifyIframeApi?: SpotifyIFrameAPI;
  }
}

let apiPromise: Promise<SpotifyIFrameAPI> | null = null;
function loadIframeApi(): Promise<SpotifyIFrameAPI> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.__spotifyIframeApi) return resolve(window.__spotifyIframeApi);
    window.onSpotifyIframeApiReady = (api) => {
      window.__spotifyIframeApi = api;
      resolve(api);
    };
    const s = document.createElement("script");
    s.src = "https://open.spotify.com/embed/iframe-api/v1";
    s.async = true;
    document.body.appendChild(s);
  });
  return apiPromise;
}

// ---------------------------------------------------------------------------

export default function ProfileTheme({
  movieId,
  filmTitle,
  posterPath,
  isMe,
  override,
}: {
  movieId: number;
  filmTitle: string;
  posterPath: string | null;
  isMe: boolean;
  override: { kind: "track" | "album"; id: string } | null;
}) {
  const [match, setMatch] = useState<Match | null>(
    override ? { ...override, name: "", artist: "" } : null,
  );
  const [loaded, setLoaded] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<SpotifyController | null>(null);
  const wantPlayRef = useRef(false); // a gesture arrived before the controller was ready

  // 1) Resolve the film → theme (unless the owner pinned an override).
  useEffect(() => {
    if (override) {
      setLoaded(true);
      return;
    }
    let alive = true;
    fetch(`/api/theme?movieId=${movieId}`)
      .then((r) => r.json())
      .then((d: { configured?: boolean; theme?: Match | null }) => {
        if (!alive) return;
        if (d.configured === false) setConfigured(false);
        setMatch(d.theme ?? null);
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [movieId, override]);

  // 2) Build the hidden Spotify controller once we have a match + a host node.
  useEffect(() => {
    if (!match || !hostRef.current) return;
    let disposed = false;
    const uri = `spotify:${match.kind}:${match.id}`;
    loadIframeApi().then((api) => {
      if (disposed || !hostRef.current) return;
      api.createController(hostRef.current, { uri, width: 320, height: 80 }, (controller) => {
        if (disposed) {
          controller.destroy();
          return;
        }
        controllerRef.current = controller;
        setReady(true);
        controller.addListener("playback_update", (e) => setPlaying(!e.data.isPaused));
        // A tap already happened while we were loading → honor it now.
        if (wantPlayRef.current) {
          wantPlayRef.current = false;
          controller.play();
        }
      });
    });
    return () => {
      disposed = true;
      try {
        controllerRef.current?.destroy();
      } catch {
        /* already gone */
      }
      controllerRef.current = null;
      setReady(false);
      setPlaying(false);
    };
  }, [match]);

  // 3) Play on first touch — the browser unlocks audio on the first real
  //    gesture, so we start the theme the instant the visitor taps/keys.
  useEffect(() => {
    if (!match) return;
    let done = false;
    const arm = () => {
      if (done) return;
      done = true;
      remove();
      if (controllerRef.current) controllerRef.current.play();
      else wantPlayRef.current = true; // controller not ready yet
    };
    const remove = () => {
      document.removeEventListener("pointerdown", arm);
      document.removeEventListener("touchstart", arm);
      document.removeEventListener("keydown", arm);
    };
    document.addEventListener("pointerdown", arm, { passive: true });
    document.addEventListener("touchstart", arm, { passive: true });
    document.addEventListener("keydown", arm);
    return remove;
  }, [match]);

  const toggle = useCallback(() => {
    sfxPop();
    if (controllerRef.current) controllerRef.current.togglePlay();
    else wantPlayRef.current = true;
  }, []);

  const onPick = useCallback((m: Match) => {
    setMatch(m); // remounts the controller effect with the new uri
    setPlaying(false);
  }, []);

  if (!configured) {
    return isMe ? (
      <p className="mt-2 font-mono text-[0.6rem] uppercase tracking-widest text-dim">
        🎵 Profile music turns on once Spotify is connected.
      </p>
    ) : null;
  }
  if (!loaded) return null;
  if (!match && !isMe) return null;

  return (
    <div className="mt-2">
      {match && (
        <div
          className="turntable"
          role="button"
          tabIndex={0}
          aria-label={`${playing ? "Pause" : "Play"} the ${filmTitle} theme`}
          aria-pressed={playing}
          onClick={toggle}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggle();
            }
          }}
        >
          <div className="tt-deck">
            <div className={`tt-vinyl ${playing ? "is-spinning" : ""}`}>
              <div className="tt-label">
                {posterPath ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={`https://image.tmdb.org/t/p/w185${posterPath}`} alt="" />
                ) : (
                  <span>{filmTitle}</span>
                )}
              </div>
            </div>
            <span className={`tt-arm ${playing ? "is-playing" : ""}`} aria-hidden />
          </div>

          <div className="min-w-0 flex-1">
            <span className="block font-mono text-[0.55rem] uppercase tracking-[0.25em] text-ticket">
              🎵 {playing ? "Now spinning" : ready ? "Tap to spin" : "Cueing…"}
            </span>
            <span className="block truncate font-display text-sm text-cream">
              {match.name || `${filmTitle} — theme`}
            </span>
            {match.artist && <span className="block truncate text-xs text-dim">{match.artist}</span>}
          </div>

          {/* The licensed audio engine — present but parked off-screen. */}
          <div className="tt-engine" aria-hidden>
            <div ref={hostRef} />
          </div>
        </div>
      )}

      {isMe && <OwnerPicker filmTitle={filmTitle} hasMatch={!!match} onPick={onPick} />}
    </div>
  );
}

// -- owner-only override -----------------------------------------------------

function OwnerPicker({
  filmTitle,
  hasMatch,
  onPick,
}: {
  filmTitle: string;
  hasMatch: boolean;
  onPick: (m: Match) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Match[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (debounce.current) clearTimeout(debounce.current);
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    debounce.current = setTimeout(() => {
      setBusy(true);
      fetch(`/api/theme?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((d: { candidates?: Match[] }) => setResults(d.candidates ?? []))
        .catch(() => setResults([]))
        .finally(() => setBusy(false));
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q, open]);

  async function choose(m: Match) {
    setSaving(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeMusic: { kind: m.kind, id: m.id } }),
      });
      if (res.ok) {
        onPick(m);
        setOpen(false);
        setQ("");
        setResults([]);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          setQ(`${filmTitle} theme`);
        }}
        className="mt-1.5 font-mono text-[0.58rem] uppercase tracking-widest text-dim underline"
      >
        {hasMatch ? "🔍 not it? pick your track" : "🔍 pick a theme for your profile"}
      </button>
    );
  }

  return (
    <div className="mt-2 rounded border border-line bg-surface p-2.5">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a song or soundtrack…"
        className="w-full rounded border border-line bg-bg px-2.5 py-1.5 text-sm text-cream placeholder:text-dim focus:border-amber focus:outline-none"
      />
      {busy && <p className="mt-1.5 font-mono text-[0.6rem] text-dim">searching…</p>}
      <ul className="mt-1.5 flex max-h-52 flex-col gap-1 overflow-y-auto">
        {results.map((m) => (
          <li key={`${m.kind}:${m.id}`}>
            <button
              disabled={saving}
              onClick={() => choose(m)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-bg disabled:opacity-50"
            >
              <span className="font-mono text-[0.5rem] uppercase tracking-widest text-ticket">
                {m.kind === "album" ? "LP" : "♪"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-cream">{m.name}</span>
                {m.artist && <span className="block truncate text-xs text-dim">{m.artist}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        onClick={() => setOpen(false)}
        className="mt-1 font-mono text-[0.58rem] uppercase tracking-widest text-dim underline"
      >
        close
      </button>
    </div>
  );
}
