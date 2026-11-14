"use client";
import { useEffect } from "react";

// The front page's two page-wide behaviours, in one mount.
//
// Rack focus on scroll: anything marked data-reveal starts soft and pulls
// sharp as it reaches the gate. The hiding is gated on a class this effect
// adds, so with scripting off — or before it arrives — nothing is ever
// invisible waiting for a script to show it.
//
// And the nav picks up a backing once you've scrolled off the hero, where it
// stops sitting on black and starts sitting on copy.

export default function LandingFX() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".lp");
    if (!root) return;

    const nav = root.querySelector<HTMLElement>(".lp-nav");
    const onScroll = () => nav?.classList.toggle("is-stuck", window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const marked = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    let io: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            e.target.classList.add("is-lit");
            io?.unobserve(e.target);
          }
        },
        { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
      );
      root.classList.add("lp-fx");
      for (const el of marked) io.observe(el);
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      io?.disconnect();
      root.classList.remove("lp-fx");
    };
  }, []);

  return null;
}
