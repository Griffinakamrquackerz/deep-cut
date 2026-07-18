"use client";
// Cinema-marquee toast bus. Any client component fires toast("…") and the
// single <MarqueeToaster/> mounted in the tab layout slides it in. Event-based
// so it works without threading a context through server-component layouts.

export type ToastTone = "amber" | "ticket" | "avail";

export interface ToastDetail {
  text: string;
  tone?: ToastTone;
  icon?: string;
}

export function toast(text: string, opts: { tone?: ToastTone; icon?: string } = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ToastDetail>("dc:toast", {
      detail: { text, tone: opts.tone ?? "amber", icon: opts.icon },
    }),
  );
}
