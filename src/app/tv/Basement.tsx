"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as RPointerEvent } from "react";
import {
  ARCADE_CABINET,
  FLOOR,
  FURNITURE,
  HOTSPOTS,
  MAP_ASPECT,
  PHOTO_ASPECT,
  SPOTS,
  STAGE_ASPECT,
  ZOOM_MAX,
  ZOOM_MIN,
  cameraWindow,
  hotspotAt,
  reachableFrom,
  spotById,
  type Hotspot,
  type Point,
  type Rect,
  type Spot,
} from "@/lib/basement";
import { sfxClick } from "@/lib/sfx";

// The basement, from where you stand.
//
// The chair's-eye photograph in /scene/room.jpg is the room — the 90s tile,
// the wood paneling, the shag and the Blockbuster rug are its own pixels —
// and you move through it the way you actually would: by looking around.
// There is no little figure to push across a perspective photograph (that
// is how a sprite ends up walking on walls); the camera is you. Each Spot
// in lib/basement.ts is a place to stand plus the window of the photograph
// you look through from there. Arrow keys step between spots along their
// links, drag looks around, the wheel and pinch zoom, and the old top-down
// floor plan survives as the little map in the corner — the map you
// consult, not the room you walk on. Reach is the same maths it always
// was: a write-up opens when you stand inside its hotspot's circle, which
// hotspotAt() has decided since the beginning.

const ROOM_IMG = "/scene/room.jpg";
const ROOM_IMG_W = 1774;
const ROOM_IMG_H = 887;

/** A camera position: the photograph UV it looks at, and how hard. */
type Cam = { cx: number; cy: number; zoom: number };

function reducedMotion() {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const k = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}

/** Ease both ends of a step between spots. */
const ease = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

function lerpCam(a: Cam, b: Cam, t: number): Cam {
  return {
    cx: a.cx + (b.cx - a.cx) * t,
    cy: a.cy + (b.cy - a.cy) * t,
    zoom: a.zoom + (b.zoom - a.zoom) * t,
  };
}

/**
 * Keep the free look inside the photograph: however far you've dragged, the
 * camera never asks to see past the edges of the room it has.
 */
function clampLook(look: Point, cam: Cam, zoomMul: number): Point {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, cam.zoom * zoomMul));
  const ww = 1 / zoom;
  const wh = (ww * STAGE_ASPECT) / PHOTO_ASPECT;
  const cx = Math.min(1 - ww / 2, Math.max(ww / 2, cam.cx + look.x));
  const cy = Math.min(1 - wh / 2, Math.max(wh / 2, cam.cy + look.y));
  return { x: cx - cam.cx, y: cy - cam.cy };
}

/**
 * The arcade cabinet, drawn standing in its place in the room. It is the
 * room's newest fixture — it isn't in the photograph — so it gets a lit
 * marquee, a screen that takes your quarter, and an empty cartridge slot
 * until the games are uploaded.
 */
function drawArcade(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  clock: number,
) {
  g.save();
  // Body.
  g.fillStyle = "#10141f";
  g.fillRect(x, y, w, h);
  g.strokeStyle = "#232c3f";
  g.lineWidth = Math.max(1, w * 0.03);
  g.strokeRect(x, y, w, h);

  // The marquee, lit.
  const mh = h * 0.2;
  const mg = g.createLinearGradient(x, y, x, y + mh);
  mg.addColorStop(0, "#f6c667");
  mg.addColorStop(1, "#b07018");
  g.fillStyle = mg;
  g.fillRect(x + w * 0.06, y + h * 0.03, w * 0.88, mh);
  g.shadowColor = "rgba(246,198,103,0.7)";
  g.shadowBlur = Math.max(4, w * 0.25);
  g.fillStyle = "#0b0f18";
  g.font = `bold ${Math.max(5, w * 0.16)}px monospace`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("ARCADE", x + w / 2, y + h * 0.03 + mh / 2);
  g.shadowBlur = 0;

  // The screen, waiting for a cartridge.
  const sy = y + mh + h * 0.08;
  const sh = h * 0.46;
  g.fillStyle = "#060b14";
  g.fillRect(x + w * 0.1, sy, w * 0.8, sh);
  g.strokeStyle = "#1b2537";
  g.lineWidth = Math.max(1, w * 0.02);
  g.strokeRect(x + w * 0.1, sy, w * 0.8, sh);
  if (reducedMotion() || (clock % 1.4) < 0.9) {
    g.fillStyle = "#e8e2d2";
    g.font = `bold ${Math.max(4, w * 0.09)}px monospace`;
    g.fillText("INSERT COIN", x + w / 2, sy + sh * 0.4);
    g.fillStyle = "rgba(232,226,210,0.45)";
    g.font = `${Math.max(3, w * 0.07)}px monospace`;
    g.fillText("GAME SLOT EMPTY", x + w / 2, sy + sh * 0.68);
  } else {
    g.fillStyle = "rgba(232,226,210,0.25)";
    g.font = `bold ${Math.max(4, w * 0.09)}px monospace`;
    g.fillText("_", x + w / 2, sy + sh * 0.4);
  }

  // The control panel and the coin door.
  g.fillStyle = "#171d2b";
  g.fillRect(x + w * 0.08, sy + sh + h * 0.02, w * 0.84, h * 0.1);
  g.fillStyle = "#d23a2a";
  g.beginPath();
  g.arc(x + w * 0.26, sy + sh + h * 0.07, Math.max(1.5, w * 0.05), 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#3fae4a";
  g.beginPath();
  g.arc(x + w * 0.72, sy + sh + h * 0.07, Math.max(1.5, w * 0.05), 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#0c101a";
  g.fillRect(x + w * 0.34, y + h * 0.88, w * 0.32, h * 0.08);
  g.strokeStyle = "#c9a227";
  g.lineWidth = Math.max(1, w * 0.02);
  g.beginPath();
  g.moveTo(x + w * 0.5, y + h * 0.9);
  g.lineTo(x + w * 0.5, y + h * 0.94);
  g.stroke();
  g.restore();
}

export default function Basement({ onSit }: { onSit: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // The photograph of the room. Loaded once; draw() looks through it.
  const imgRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = new Image();
    img.src = ROOM_IMG;
    imgRef.current = img;
  }, []);

  // The camera: the spot you're standing at, the tween carrying you to the
  // next one, and the free look — how far you've dragged or zoomed since
  // you arrived. All refs because the render loop reads them every frame;
  // only `spotId` re-renders, to label where you are.
  const spotRef = useRef("chair");
  const [spotId, setSpotId] = useState("chair");
  const camRef = useRef<Cam>({ cx: 0.5, cy: 0.5, zoom: 1 });
  const tweenRef = useRef<{ from: Cam; to: Cam; t: number } | null>(null);
  const lookRef = useRef<Point>({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const clockRef = useRef(0);

  // The hotspot you can reach from where you stand, and the one you've
  // opened. Mirrored into refs so the loop and key handlers never read
  // stale state.
  const nearRef = useRef<Hotspot | null>(null);
  const [near, setNear] = useState<Hotspot | null>(null);
  const [open, setOpen] = useState<Hotspot | null>(null);
  const openRef = useRef<Hotspot | null>(null);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  // How much of the write-up has been typed out so far.
  const [reveal, setReveal] = useState(0);
  const revealRef = useRef(0);

  // You start at the recliner, which is also the way in.
  useEffect(() => {
    const h = hotspotAt(spotById("chair")!.stand);
    nearRef.current = h;
    setNear(h);
  }, []);

  // The typewriter. Under reduced motion the whole write-up simply arrives —
  // a flourish nobody can dismiss is a toll booth.
  useEffect(() => {
    if (!open) return;
    if (reducedMotion()) {
      setReveal(open.blurb.length);
      revealRef.current = open.blurb.length;
      return;
    }
    setReveal(0);
    revealRef.current = 0;
    const id = setInterval(() => {
      setReveal((n) => {
        const limit = openRef.current ? openRef.current.blurb.length : 0;
        const next = Math.min(limit, n + 2);
        revealRef.current = next;
        if (next >= limit && id) clearInterval(id);
        return next;
      });
    }, 18);
    return () => clearInterval(id);
  }, [open]);

  /** The window of the photograph you're looking through this frame. */
  const effectiveWindow = useCallback((): Rect => {
    return cameraWindow({
      cx: camRef.current.cx + lookRef.current.x,
      cy: camRef.current.cy + lookRef.current.y,
      zoom: camRef.current.zoom * zoomRef.current,
    });
  }, []);

  /** The corner floor plan, in canvas pixels. draw() uses the same maths. */
  const minimapBox = useCallback((w: number, h: number) => {
    const mw = Math.min(w * 0.26, 220);
    const mh = mw / MAP_ASPECT;
    return { x: w - mw - 10, y: h - mh - 10, w: mw, h: mh };
  }, []);

  /** Step to another spot: tween the camera there, reset the free look. */
  const travel = useCallback(
    (id: string) => {
      const to = spotById(id);
      const from = spotById(spotRef.current);
      if (!to || !from || id === from.id) return;
      sfxClick();
      spotRef.current = id;
      setSpotId(id);
      lookRef.current = { x: 0, y: 0 };
      zoomRef.current = 1;
      if (reducedMotion()) {
        camRef.current = { ...to.cam };
        tweenRef.current = null;
      } else {
        tweenRef.current = { from: { ...camRef.current }, to: to.cam, t: 0 };
      }
      // You know what you can reach as soon as your feet are planted.
      const h = hotspotAt(to.stand);
      nearRef.current = h;
      setNear(h);
    },
    [],
  );

  /**
   * One keypress, one step: the linked spot most in the direction you
   * pressed. Pokemon without the grid — a step is a step.
   */
  const step = useCallback(
    (dx: number, dy: number) => {
      const cur = spotById(spotRef.current);
      if (!cur) return;
      let best: Spot | null = null;
      let bestScore = 0.3; // ignore links that aren't really that way
      for (const id of cur.links) {
        const s = spotById(id);
        if (!s) continue;
        const vx = s.stand.x - cur.stand.x;
        const vy = s.stand.y - cur.stand.y;
        const d = Math.hypot(vx, vy) || 1;
        const score = (vx * dx + vy * dy) / d;
        if (score > bestScore) {
          bestScore = score;
          best = s;
        }
      }
      if (best) travel(best.id);
    },
    [travel],
  );

  /** The same key that opens a write-up closes it or finishes typing it. */
  const interact = useCallback(() => {
    const openNow = openRef.current;
    if (openNow) {
      if (revealRef.current < openNow.blurb.length) {
        setReveal(openNow.blurb.length);
        revealRef.current = openNow.blurb.length;
      } else {
        setOpen(null);
      }
      return;
    }
    const close = nearRef.current;
    if (!close) return;
    sfxClick();
    if (close.action === "sit") {
      onSit();
      return;
    }
    setOpen(close);
  }, [onSit]);

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

    const win = effectiveWindow();
    const clock = clockRef.current;

    // The room itself: the window of the photograph you're looking through,
    // stretched to the whole stage. Nothing is drawn over it but the
    // cabinet, the pins and the corner map — the tile, the paneling, the
    // rugs are the photograph's own pixels.
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth) {
      g.drawImage(
        img,
        win.x * ROOM_IMG_W,
        win.y * ROOM_IMG_H,
        win.w * ROOM_IMG_W,
        win.h * ROOM_IMG_H,
        0,
        0,
        w,
        h,
      );
    } else {
      g.fillStyle = "#1a130f";
      g.fillRect(0, 0, w, h);
    }

    // The arcade cabinet, standing in its place — visible whenever the
    // camera is anywhere near it.
    const ax = ((ARCADE_CABINET.x - win.x) / win.w) * w;
    const ay = ((ARCADE_CABINET.y - win.y) / win.h) * h;
    const aw = (ARCADE_CABINET.w / win.w) * w;
    const ah = (ARCADE_CABINET.h / win.h) * h;
    if (aw > 4 && ax < w && ay < h && ax + aw > 0 && ay + ah > 0) {
      drawArcade(g, ax, ay, aw, ah, clock);
    }

    // Hotspot pins at their real places in the photograph. The ones you can
    // reach from where you stand are lit amber; the rest are quiet white.
    const spot = spotById(spotRef.current);
    const reach = new Set(spot ? reachableFrom(spot.stand).map((x) => x.id) : []);
    const pinR = Math.max(3, Math.min(11, (w * 0.0075) / Math.sqrt(win.w * 2.6)));
    for (const hs of HOTSPOTS) {
      if (hs.id === "rug") continue;
      const px = ((hs.pin.x + hs.pin.w / 2 - win.x) / win.w) * w;
      const py = ((hs.pin.y + hs.pin.h / 2 - win.y) / win.h) * h;
      if (px < -14 || py < -14 || px > w + 14 || py > h + 14) continue;
      const can = reach.has(hs.id);
      g.save();
      g.shadowColor = can ? "rgba(212,160,74,0.9)" : "rgba(180,200,220,0.35)";
      g.shadowBlur = can ? 10 : 3;
      g.fillStyle = can ? "#f0d9a8" : "rgba(255,255,255,0.55)";
      g.beginPath();
      g.arc(px, py, hs.id === "chair" ? pinR * 1.25 : pinR, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    // The corner floor plan — the bird's-eye map of the room you consult
    // like a real map: furniture as dark blocks, every place to stand as a
    // dot, yours pulsing amber.
    const m = minimapBox(w, h);
    g.save();
    g.fillStyle = "rgba(8,6,4,0.82)";
    roundRect(g, m.x, m.y, m.w, m.h, 8);
    g.fill();
    g.strokeStyle = "rgba(212,160,74,0.45)";
    g.lineWidth = 1;
    roundRect(g, m.x, m.y, m.w, m.h, 8);
    g.stroke();
    g.fillStyle = "rgba(242,239,230,0.10)";
    g.fillRect(m.x + FLOOR.x * m.w, m.y + FLOOR.y * m.h, FLOOR.w * m.w, FLOOR.h * m.h);
    g.fillStyle = "rgba(0,0,0,0.55)";
    for (const f of FURNITURE) {
      g.fillRect(m.x + f.x * m.w, m.y + f.y * m.h, f.w * m.w, f.h * m.h);
    }
    const cur = spotById(spotRef.current);
    for (const s of SPOTS) {
      const px = m.x + s.stand.x * m.w;
      const py = m.y + s.stand.y * m.h;
      if (cur && s.id === cur.id) {
        const pulse = reducedMotion() ? 1 : 1 + Math.sin(clock * 4) * 0.3;
        g.save();
        g.shadowColor = "rgba(212,160,74,0.9)";
        g.shadowBlur = 8;
        g.fillStyle = "#d4a04a";
        g.beginPath();
        g.arc(px, py, 4.5 * pulse, 0, Math.PI * 2);
        g.fill();
        g.restore();
      } else {
        const linked = cur ? cur.links.includes(s.id) : false;
        g.fillStyle = linked ? "rgba(242,239,230,0.95)" : "rgba(242,239,230,0.45)";
        g.beginPath();
        g.arc(px, py, 2.4, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();

    // The room goes dark while somebody's reading.
    if (openRef.current) {
      g.fillStyle = "rgba(4,5,10,0.45)";
      g.fillRect(0, 0, w, h);
    }

    const vg = g.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.3,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.72,
    );
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.5)");
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
  }, [effectiveWindow, minimapBox]);

  // The loop: advance the spot tween, then draw. It does nothing while the
  // tab is hidden — the browser throttles rAF anyway, and the room is not
  // worth a battery.
  useEffect(() => {
    let raf = 0;
    let prev = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - prev) / 1000);
      prev = t;
      if (!document.hidden) {
        const tw = tweenRef.current;
        if (tw) {
          tw.t = Math.min(1, tw.t + dt / 0.65);
          camRef.current = lerpCam(tw.from, tw.to, ease(tw.t));
          if (tw.t >= 1) tweenRef.current = null;
        }
        clockRef.current += dt;
        draw();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  // The keys: one press, one step. Held keys don't sprint you across the
  // room; each step is a decision, like turning a page.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const el = e.target as HTMLElement | null;
      // Never move while somebody is typing into something.
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        return;
      }
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) {
        e.preventDefault();
        if (e.repeat || openRef.current) return;
        if (k === "arrowup" || k === "w") step(0, -1);
        else if (k === "arrowdown" || k === "s") step(0, 1);
        else if (k === "arrowleft" || k === "a") step(-1, 0);
        else step(1, 0);
        return;
      }
      if (k === "e") {
        e.preventDefault();
        interact();
        return;
      }
      if (k === " " || k === "enter") {
        // A focused button already gets the browser's own click. Firing ours
        // as well would sit down and open a write-up in the same keystroke.
        const tag = el?.tagName ?? "";
        if (tag === "BUTTON" || tag === "A" || tag === "SUMMARY") return;
        e.preventDefault();
        interact();
        return;
      }
      if (k === "escape") setOpen(null);
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [step, interact]);

  // The wheel: lean in, step back. Clamped to the photo's own sharpness.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (openRef.current) return;
      e.preventDefault();
      const spot = spotById(spotRef.current);
      const base = spot ? spot.cam.zoom : ZOOM_MIN;
      const lo = Math.max(0.35, ZOOM_MIN / base);
      const hi = ZOOM_MAX / base;
      zoomRef.current = Math.min(hi, Math.max(lo, zoomRef.current * Math.exp(-e.deltaY * 0.0012)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Look around by dragging, pinch to zoom, tap a pin or the corner map to
  // travel. One finger is a look-around until it turns out to be a tap.
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const dragRef = useRef<{ id: number; moved: boolean; sx: number; sy: number } | null>(null);
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

  const localPoint = (e: RPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** A tap that didn't become a drag: the corner map, or a pin. */
  const handleTap = useCallback(
    (lx: number, ly: number) => {
      const el = canvas.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      // The corner map: tap a dot to stand there.
      const m = minimapBox(w, h);
      if (lx >= m.x && lx <= m.x + m.w && ly >= m.y && ly <= m.y + m.h) {
        const ux = (lx - m.x) / m.w;
        const uy = (ly - m.y) / m.h;
        const cur = spotById(spotRef.current);
        let best: Spot | null = null;
        let bestD = 0.07;
        for (const s of SPOTS) {
          const d = Math.hypot(s.stand.x - ux, s.stand.y - uy);
          if (d < bestD) {
            bestD = d;
            best = s;
          }
        }
        if (best && (!cur || best.id !== cur.id)) travel(best.id);
        return;
      }
      // A pin: go stand where you can reach it.
      const win = effectiveWindow();
      const cur = spotById(spotRef.current);
      for (const hs of HOTSPOTS) {
        if (hs.id === "rug") continue;
        const px = ((hs.pin.x + hs.pin.w / 2 - win.x) / win.w) * w;
        const py = ((hs.pin.y + hs.pin.h / 2 - win.y) / win.h) * h;
        if (Math.hypot(px - lx, py - ly) > Math.max(16, w * 0.02)) continue;
        let best: Spot | null = null;
        let bestD = Infinity;
        for (const s of SPOTS) {
          if (!reachableFrom(s.stand).some((x) => x.id === hs.id)) continue;
          const d = cur ? Math.hypot(s.stand.x - cur.stand.x, s.stand.y - cur.stand.y) : 0;
          if (d < bestD) {
            bestD = d;
            best = s;
          }
        }
        if (best && (!cur || best.id !== cur.id)) travel(best.id);
        return;
      }
    },
    [effectiveWindow, minimapBox, travel],
  );

  const onPointerDown = useCallback((e: RPointerEvent<HTMLCanvasElement>) => {
    if (openRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = localPoint(e);
    pointersRef.current.set(e.pointerId, p);
    if (pointersRef.current.size === 1) {
      dragRef.current = { id: e.pointerId, moved: false, sx: p.x, sy: p.y };
    } else if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      dragRef.current = null;
      pinchRef.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        zoom: zoomRef.current,
      };
    }
  }, []);

  const onPointerMove = useCallback(
    (e: RPointerEvent<HTMLCanvasElement>) => {
      const all = pointersRef.current;
      const prevPt = all.get(e.pointerId);
      if (!prevPt) return;
      const p = localPoint(e);
      if (pinchRef.current && all.size >= 2) {
        all.set(e.pointerId, p);
        const [a, b] = [...all.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const spot = spotById(spotRef.current);
        const base = spot ? spot.cam.zoom : ZOOM_MIN;
        const lo = Math.max(0.35, ZOOM_MIN / base);
        const hi = ZOOM_MAX / base;
        zoomRef.current = Math.min(
          hi,
          Math.max(lo, pinchRef.current.zoom * (dist / pinchRef.current.dist)),
        );
        return;
      }
      const drag = dragRef.current;
      if (drag && drag.id === e.pointerId) {
        const el = canvas.current;
        if (el) {
          const win = effectiveWindow();
          lookRef.current.x -= ((p.x - prevPt.x) / el.clientWidth) * win.w;
          lookRef.current.y -= ((p.y - prevPt.y) / el.clientHeight) * win.h;
          lookRef.current = clampLook(lookRef.current, camRef.current, zoomRef.current);
          if (Math.hypot(p.x - drag.sx, p.y - drag.sy) > 6) drag.moved = true;
        }
      }
      all.set(e.pointerId, p);
    },
    [effectiveWindow],
  );

  const onPointerUp = useCallback(
    (e: RPointerEvent<HTMLCanvasElement>) => {
      const all = pointersRef.current;
      const had = all.has(e.pointerId);
      all.delete(e.pointerId);
      if (all.size < 2) pinchRef.current = null;
      const drag = dragRef.current;
      if (had && drag && drag.id === e.pointerId) {
        dragRef.current = null;
        if (!drag.moved && !openRef.current) handleTap(drag.sx, drag.sy);
      }
    },
    [handleTap],
  );

  const onPointerCancel = useCallback((e: RPointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (dragRef.current?.id === e.pointerId) dragRef.current = null;
  }, []);

  const spot = spotById(spotId);

  return (
    <section className="flex flex-col gap-5">
      <header>
        <p className="eyebrow">Monthly showcase</p>
        <h1 className="glow-amber neon-flicker font-display text-5xl text-amber">
          DEEP CUT THEATRE
        </h1>
        <p className="mt-1 text-sm text-dim">
          Award-winning indie films you've never seen. Step through the
          basement, look at anything that deserves a story, then take the
          recliner.
        </p>
      </header>

      {/* ── The room, from where you stand ──────────────────────────────
          The photograph is the room; you move by stepping between places
          to stand and looking around from each one. */}
      <div
        className="relative mx-auto w-full overflow-hidden rounded-2xl border-2 border-[#4a3b31] bg-[#241a12] shadow-2xl"
        style={{ aspectRatio: String(STAGE_ASPECT) }}
      >
        <canvas
          ref={canvas}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          className="absolute inset-0 block h-full w-full cursor-grab touch-none"
          role="img"
          aria-label="The basement, seen from where you stand. Step between viewpoints with the arrow keys or WASD, drag to look around, scroll or pinch to zoom, and press space to look at whatever you are standing next to."
        />

        {/* Where you're standing. */}
        <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-line bg-[#040810]/80 px-2.5 py-1 font-mono text-[0.55rem] uppercase tracking-widest text-dim">
          ● {spot?.label ?? "The basement"}
        </div>

        {/* The prompt is a real button, not a drawn one — reachable by tab
            and thumb alike. */}
        {near && !open && (
          <button
            type="button"
            onClick={interact}
            className="animate-pulse absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber bg-[#040810]/90 px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-widest text-amber shadow-lg"
          >
            {near.action === "sit" ? "🛋 Sit down" : `🔍 ${near.label}`}
          </button>
        )}

        {/* The write-up. The portrait is a crop of the chair's-eye photograph,
            positioned by the same maths the Now Showing card uses. */}
        {open && (
          <div className="absolute inset-x-2 bottom-2 z-20 rounded-xl border-2 border-amber bg-[#0b0a08]/95 p-3 shadow-2xl">
            <div className="flex gap-3">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-line bg-surface">
                {open.crop && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src="/scene/room.jpg?v=3"
                    alt=""
                    className="absolute"
                    style={{
                      width: `${100 / open.crop.w}%`,
                      height: `${100 / open.crop.h}%`,
                      left: `${(-open.crop.x / open.crop.w) * 100}%`,
                      top: `${(-open.crop.y / open.crop.h) * 100}%`,
                    }}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="eyebrow">{open.label}</p>
                <p className="mt-1 text-sm leading-relaxed text-cream">{open.blurb.slice(0, reveal)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="mt-2 w-full text-right font-mono text-[0.55rem] uppercase tracking-widest text-dim"
            >
              ▼ Space / tap
            </button>
          </div>
        )}
      </div>

      {/* ── Skip the walk ─────────────────────────────────────────────
          Every write-up reachable without stepping, and the theatre
          reachable without sitting down. Nobody has to play the game to
          get the films. */}
      <div className="rounded border border-line bg-surface p-4">
        <p className="eyebrow">What's in the room</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {HOTSPOTS.filter((h) => h.action !== "sit").map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => setOpen(h)}
              className="rounded-full border border-line px-2.5 py-1 font-mono text-[0.6rem] text-cream hover:border-amber hover:text-amber"
            >
              {h.glyph} {h.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onSit}
          className="mt-3 w-full rounded-full border border-amber px-3.5 py-2 font-mono text-[0.65rem] uppercase tracking-widest text-amber"
        >
          🛋 Sit down and watch
        </button>
      </div>

      <p className="text-center font-mono text-[0.55rem] leading-relaxed text-dim/80">
        Arrow keys or WASD step between viewpoints · drag to look around ·
        scroll or pinch to zoom · space to look closer
      </p>
    </section>
  );
}