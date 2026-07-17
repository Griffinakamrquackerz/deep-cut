"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { isMuted, setMuted, sfxClick } from "@/lib/sfx";

const SIDE_TABS = [
  { href: "/playlists", label: "Mixtapes", glyph: "✉" },
  { href: "/lobby", label: "Community", glyph: "🍿" },
  null, // center stage — the Tonight reel
  { href: "/you", label: "You", glyph: "🎟" },
] as const;

export default function TabBar() {
  const pathname = usePathname();
  const [muted, setM] = useState(true);
  useEffect(() => setM(isMuted()), []);

  const tonightActive = pathname === "/";

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 bg-surface/95 backdrop-blur"
    >
      {/* Sprocket holes along the top — the bar is a strip of film. */}
      <div className="film-strip" aria-hidden />
      <div className="mx-auto grid w-full max-w-md grid-cols-5 items-end px-1 pb-[env(safe-area-inset-bottom)] sm:max-w-lg md:max-w-2xl">
        {SIDE_TABS.map((t, i) =>
          t === null ? (
            /* ★ Center stage: the Tonight reel ★ */
            <Link
              key="tonight"
              href="/"
              aria-current={tonightActive ? "page" : undefined}
              aria-label="Tonight"
              style={{ gridColumnStart: 3 }}
              className={`relative -mt-7 mx-auto flex h-[4.4rem] w-[4.4rem] flex-col items-center justify-center gap-0.5 rounded-full border-2 border-amber bg-ticket text-cream transition-transform active:scale-90 ${
                tonightActive
                  ? "shadow-[0_0_26px_rgba(228,87,61,0.65)]"
                  : "opacity-90 shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
              }`}
            >
              {/* Dashed ring = reel sprockets; it spins while the projector runs. */}
              <span
                aria-hidden
                className={`pointer-events-none absolute inset-[0.3rem] rounded-full border-2 border-dashed border-cream/50 ${
                  tonightActive ? "reel-spin" : ""
                }`}
              />
              <span aria-hidden className="text-xl leading-none">
                🎬
              </span>
              <span className="font-mono text-[0.55rem] font-medium uppercase tracking-[0.15em]">
                Tonight
              </span>
            </Link>
          ) : (
            <Link
              key={t.href}
              href={t.href}
              aria-current={pathname.startsWith(t.href) ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2.5 font-mono text-[0.6rem] uppercase tracking-widest transition-transform active:scale-90 ${
                pathname.startsWith(t.href)
                  ? "text-amber [&>span:last-child]:glow-amber"
                  : "text-dim hover:text-cream"
              }`}
              style={{ gridColumnStart: i + 1 }}
            >
              <span
                aria-hidden
                className={`text-base leading-none ${
                  pathname.startsWith(t.href) ? "wiggle" : "grayscale"
                }`}
              >
                {t.glyph}
              </span>
              <span>{t.label}</span>
            </Link>
          ),
        )}

        {/* House lights: sound on/off, styled like a projection-booth switch. */}
        <button
          onClick={() => {
            const next = !muted;
            setMuted(next);
            setM(next);
            if (!next) sfxClick();
          }}
          aria-label={muted ? "Unmute sound effects" : "Mute sound effects"}
          aria-pressed={!muted}
          className={`col-start-5 flex flex-col items-center gap-0.5 py-2.5 font-mono text-[0.6rem] uppercase tracking-widest transition-transform active:scale-90 ${
            muted ? "text-dim" : "text-amber"
          }`}
        >
          <span aria-hidden className={`text-base leading-none ${muted ? "grayscale" : ""}`}>
            {muted ? "🔇" : "🔊"}
          </span>
          <span>Sound</span>
        </button>
      </div>
    </nav>
  );
}
