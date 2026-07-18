"use client";
import { useEffect, useState } from "react";
import type { ToastDetail, ToastTone } from "@/lib/toast";

interface Item extends ToastDetail {
  id: number;
}

const TONE_CLASS: Record<ToastTone, string> = {
  amber: "border-amber text-amber",
  ticket: "border-ticket text-ticket glow-ticket",
  avail: "border-avail text-avail",
};

// Cinema-announcement toasts: bulbs, a marquee slide-in, auto-dismiss.
export default function MarqueeToaster() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let n = 0;
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      const id = ++n;
      setItems((prev) => [...prev.slice(-2), { ...detail, id }]);
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 2600);
    }
    window.addEventListener("dc:toast", onToast);
    return () => window.removeEventListener("dc:toast", onToast);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
      {items.map((it) => (
        <div
          key={it.id}
          role="status"
          className={`marquee-toast flex items-center gap-2 rounded-full border bg-surface/95 px-4 py-2 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.8)] backdrop-blur ${
            TONE_CLASS[it.tone ?? "amber"]
          }`}
        >
          <span aria-hidden className="text-xs">
            {"● ● ●"}
          </span>
          <span className="font-mono text-[0.7rem] font-medium uppercase tracking-[0.18em]">
            {it.icon ? `${it.icon} ` : ""}
            {it.text}
          </span>
          <span aria-hidden className="text-xs">
            {"● ● ●"}
          </span>
        </div>
      ))}
    </div>
  );
}
