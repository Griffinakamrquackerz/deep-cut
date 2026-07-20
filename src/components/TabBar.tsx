"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LEFT_TABS = [
  { href: "/playlists", label: "Mixtapes", glyph: "✉" },
  { href: "/lobby", label: "Community", glyph: "🍿" },
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
}: {
  href: string;
  label: string;
  glyph: string;
  active: boolean;
  usher?: string;
}) {
  return (
    <Link
      href={href}
      data-usher={usher}
      aria-current={active ? "page" : undefined}
      className={`flex flex-col items-center gap-0.5 py-2.5 font-mono text-[0.6rem] uppercase tracking-widest transition-transform active:scale-90 ${
        active ? "text-amber [&>span:last-child]:glow-amber" : "text-dim hover:text-cream"
      }`}
    >
      <span aria-hidden className={`text-base leading-none ${active ? "wiggle" : "grayscale"}`}>
        {glyph}
      </span>
      <span>{label}</span>
    </Link>
  );
}

export default function TabBar() {
  const pathname = usePathname();
  const tonightActive = pathname === "/";

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 bg-surface/95 backdrop-blur"
    >
      {/* Sprocket holes along the top — the bar is a strip of film. */}
      <div className="film-strip" aria-hidden />
      <div className="mx-auto flex w-full max-w-md items-end pb-[env(safe-area-inset-bottom)] sm:max-w-lg md:max-w-2xl">
        <div className="flex flex-1 items-end justify-around">
          {LEFT_TABS.map((t) => (
            <SideTab key={t.href} {...t} active={pathname.startsWith(t.href)} />
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
