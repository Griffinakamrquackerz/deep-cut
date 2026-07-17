"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Tonight", glyph: "◆" },
  { href: "/playlists", label: "Playlists", glyph: "✉" },
  { href: "/lobby", label: "Lobby", glyph: "☰" },
  { href: "/you", label: "You", glyph: "★" },
] as const;

export default function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-md justify-around sm:max-w-lg md:max-w-2xl">
        {TABS.map((t) => {
          const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 font-mono text-[0.6rem] uppercase tracking-widest transition-colors ${
                active ? "text-amber [&>span]:glow-amber" : "text-dim hover:text-cream"
              }`}
            >
              <span aria-hidden className="text-base leading-none">
                {t.glyph}
              </span>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
