"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// The basement, from where you sit.
//
// The chair's-eye photograph in /scene/room.jpg is the room — the 90s tile,
// the wood paneling, the shag and the Blockbuster rug are its own pixels.
// You look at the TV, and everything else is around it. No walking, no
// clicking on objects, no zooming — just sit down and watch.

const ROOM_IMG = "/scene/room.jpg";
const ROOM_IMG_W = 1774;
const ROOM_IMG_H = 887;

export default function Basement({ onSit }: { onSit: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = ROOM_IMG;
    imgRef.current = img;
  }, []);

  const draw = useCallback(() => {
    const el = canvas.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (el.width !== pw || el.height !== ph) {
      el.width = pw;
      el.height = ph;
    }
    const g = el.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear to black.
    g.fillStyle = "#040810";
    g.fillRect(0, 0, w, h);

    // Draw the room photograph, filling the canvas.
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth) {
      const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const sw = img.naturalWidth * scale;
      const sh = img.naturalHeight * scale;
      const dx = (w - sw) / 2;
      const dy = (h - sh) / 2;
      g.drawImage(img, dx, dy, sw, sh);
    } else {
      g.fillStyle = "#1a130f";
      g.fillRect(0, 0, w, h);
    }

    // Vignette around the edges.
    const vg = g.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.2,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.8,
    );
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.6)");
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
  }, []);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    draw();
  }, [draw]);

  return (
    <section className="flex flex-col gap-5">
      <header>
        <p className="eyebrow">Monthly showcase</p>
        <h1 className="glow-amber neon-flicker font-display text-5xl text-amber">
          DEEP CUT THEATRE
        </h1>
        <p className="mt-1 text-sm text-dim">
          Award-winning indie films you've never seen. Take the recliner and
          watch.
        </p>
      </header>

      {/* ── The room, from where you sit ────────────────────────────── */}
      <div
        className="relative mx-auto w-full overflow-hidden rounded-2xl border-2 border-[#4a3b31] bg-[#241a12] shadow-2xl"
        style={{ aspectRatio: String(1774 / 887) }}
      >
        <canvas
          ref={canvas}
          className="absolute inset-0 block h-full w-full cursor-grab touch-none"
          role="img"
          aria-label="The basement, seen from the recliner. The TV is ahead, memrabilia on the walls around it."
        />
      </div>

      {/* ── Sit down and watch ──────────────────────────────────────── */}
      <button
        type="button"
        onClick={onSit}
        className="w-full rounded-full border border-amber px-3.5 py-2 font-mono text-[0.65rem] uppercase tracking-widest text-amber shadow-lg hover:bg-amber/10"
      >
        🛋 Sit down and watch
      </button>
    </section>
  );
}