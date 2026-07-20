"use client";
import { useEffect, useRef, useState } from "react";
import { sfxPop } from "@/lib/sfx";

// The profile's theme music — MySpace, but legal. We render Spotify's OWN
// embed player (it carries the licenses; we host zero audio) matched to the
// member's signature film. The iframe only mounts on tap, so nothing loads or
// plays until a visitor asks — no autoplay wall, no wasted bandwidth. Owners
// get a "not it?" picker to override the auto-match with any track/album.

interface Match {
  kind: "track" | "album";
  id: string;
  name: string;
  artist: string;
}

function embedUrl(kind: "track" | "album", id: string): string {
  return `https://open.spotify.com/embed/${kind}/${id}?theme=0`;
}

export default function ProfileTheme({
  movieId,
  filmTitle,
  isMe,
  override,
}: {
  movieId: number;
  filmTitle: string;
  isMe: boolean;
  override: { kind: "track" | "album"; id: string } | null;
}) {
  const [match, setMatch] = useState<Match | null>(
    override ? { ...override, name: "", artist: "" } : null,
  );
  const [loaded, setLoaded] = useState(false); // did the auto-match request return?
  const [playing, setPlaying] = useState(false); // iframe mounted?
  const [configured, setConfigured] = useState(true);

  // Auto-match unless the owner has pinned an override.
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

  // Spotify not wired up yet → the whole feature is dark. Owner gets a hint.
  if (!configured) {
    return isMe ? (
      <p className="mt-2 font-mono text-[0.6rem] uppercase tracking-widest text-dim">
        🎵 Profile music turns on once Spotify is connected.
      </p>
    ) : null;
  }

  // Still resolving, or genuinely no match and you're a visitor → show nothing.
  if (!loaded) return null;
  if (!match && !isMe) return null;

  const height = match?.kind === "album" ? 232 : 152;

  return (
    <div className="mt-2">
      {match && !playing && (
        <button
          onClick={() => {
            sfxPop();
            setPlaying(true);
          }}
          className="group flex w-full items-center gap-2 rounded border border-amber/50 bg-bg/70 px-3 py-2 text-left backdrop-blur-sm transition-colors hover:border-amber"
        >
          <span className="text-base leading-none">▶</span>
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-[0.55rem] uppercase tracking-[0.25em] text-ticket">
              🎵 Play the theme
            </span>
            <span className="block truncate font-display text-sm text-cream">
              {match.name || `${filmTitle} — theme`}
              {match.artist ? <span className="text-dim"> · {match.artist}</span> : null}
            </span>
          </span>
        </button>
      )}

      {match && playing && (
        <div className="overflow-hidden rounded border border-amber/40">
          <iframe
            title={`${filmTitle} theme`}
            src={embedUrl(match.kind, match.id)}
            width="100%"
            height={height}
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            className="block w-full"
          />
        </div>
      )}

      {isMe && <OwnerPicker filmTitle={filmTitle} hasMatch={!!match} onPick={(m) => { setMatch(m); setPlaying(false); }} />}
    </div>
  );
}

// -- owner-only override --------------------------------------------------

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
