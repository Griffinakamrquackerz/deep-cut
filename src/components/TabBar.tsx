"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const LEFT_TABS = [
  { href: "/playlists", label: "Mixtapes", glyph: "✉", usher: "mixtapestab" },
  { href: "/lobby", label: "Community", glyph: "🍿", usher: "communitytab" },
] as const;

const RIGHT_TABS = [
  { href: "/you", label: "You", glyph: "🎟", usher: "youtab" },
  { href: "/settings", label: "Settings", glyph: "🎛", usher: "settingstab" },
] as const;

function SideTab({
  href,
  label,
  glyph,
  active,
  usher,
  badge = 0,
}: {
  href: string;
  label: string;
  glyph: string;
  active: boolean;
  usher?: string;
  /** Unread things waiting behind this tab. */
  badge?: number;
}) {
  return (
    <Link
      href={href}
      data-usher={usher}
      aria-current={active ? "page" : undefined}
      aria-label={badge > 0 ? `${label} (${badge} unread)` : undefined}
      className={`flex flex-col items-center gap-0.5 py-2.5 font-mono text-[0.6rem] uppercase tracking-widest transition-transform active:scale-90 ${
        active ? "text-amber [&>span:last-child]:glow-amber" : "text-dim hover:text-cream"
      }`}
    >
      <span className="relative">
        <span aria-hidden className={`block text-base leading-none ${active ? "wiggle" : "grayscale"}`}>
          {glyph}
        </span>
        {badge > 0 && (
          <span
            aria-hidden
            className="absolute -right-1.5 -top-0.5 min-w-[0.95rem] rounded-full bg-ticket px-1 text-center font-mono text-[0.5rem] leading-[0.95rem] text-cream"
          >
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span>{label}</span>
    </Link>
  );
}

export default function TabBar() {
  const pathname = usePathname();
  const tonightActive = pathname === "/";

  // Someone tagging you or sending you a film is worth knowing about from
  // wherever you are. Before this the count only existed on a chip INSIDE the
  // Community tab, so the only way to find out you had something waiting was
  // to go looking in the room you'd only enter if you already knew.
  //
  // Re-read on navigation: it's a cheap count, and it's how the badge clears
  // after you've been to the inbox without needing a refresh.
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    void fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive) setUnread(Number(d?.unread ?? 0));
      })
      .catch(() => {}); // furniture must not throw
    return () => {
      alive = false;
    };
  }, [pathname]);

  return (
    <nav
      aria-label="Primary"
      // Held to the app's column: on a desk the bar is the bottom of the strip
      // of film the whole app sits in, not a band across an empty room.
      className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md bg-surface/95 backdrop-blur sm:max-w-lg md:max-w-2xl"
    >
      {/* Sprocket holes along the top — the bar is a strip of film. */}
      <div className="film-strip" aria-hidden />
      <div className="flex w-full items-end pb-[env(safe-area-inset-bottom)]">
        <div className="flex flex-1 items-end justify-around">
          {LEFT_TABS.map((t) => (
            <SideTab
              key={t.href}
              {...t}
              active={pathname.startsWith(t.href)}
              badge={t.href === "/lobby" ? unread : 0}
            />
          ))}
        </div>

        {/* ★ Center stage: the Tonight reel ★ */}
        <Link
          href="/"
          aria-current={tonightActive ? "page" : undefined}
          aria-label="Tonight"
          className={`relative -mt-7 flex h-[4.4rem] w-[4.4rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-full border-2 border-amber bg-ticket text-cream transition-transform active:scale-90 ${
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

        <div className="flex flex-1 items-end justify-around">
          {RIGHT_TABS.map((t) => (
            <SideTab key={t.href} {...t} active={pathname.startsWith(t.href)} />
          ))}
        </div>
      </div>
    </nav>
  );
}
