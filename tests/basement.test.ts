import { describe, expect, it } from "vitest";
import {
  CHARACTER_R,
  FLOOR,
  FURNITURE,
  HOTSPOTS,
  clampToFloor,
  hotspotAt,
  resolveCollision,
  stepWalk,
  tapTarget,
} from "@/lib/basement";

const overlaps = (p: { x: number; y: number }, r: number, rects = FURNITURE) =>
  rects.some((f) => {
    const cx = Math.max(f.x, Math.min(p.x, f.x + f.w));
    const cy = Math.max(f.y, Math.min(p.y, f.y + f.h));
    return Math.hypot(p.x - cx, p.y - cy) < r;
  });

describe("the basement floor plan", () => {
  it("gives every hotspot a stand-point that is on the carpet", () => {
    for (const h of HOTSPOTS) {
      expect(clampToFloor(h), `${h.id} stands on the carpet`).toEqual({ x: h.x, y: h.y });
    }
  });

  it("gives every hotspot a stand-point clear of the furniture", () => {
    for (const h of HOTSPOTS) {
      expect(overlaps(h, 0.02), `${h.id} can be stood at: ${h.id}`).toBe(false);
    }
  });

  it("keeps every pin on the map", () => {
    for (const h of HOTSPOTS) {
      expect(h.pin.x, h.id).toBeGreaterThanOrEqual(0);
      expect(h.pin.y, h.id).toBeGreaterThanOrEqual(0);
      expect(h.pin.x + h.pin.w, h.id).toBeLessThanOrEqual(1);
      expect(h.pin.y + h.pin.h, h.id).toBeLessThanOrEqual(1);
    }
  });

  it("gives every hotspot a write-up worth the walk", () => {
    for (const h of HOTSPOTS) {
      expect(h.blurb.length, h.id).toBeGreaterThan(80);
      expect(h.label.length, h.id).toBeGreaterThan(0);
    }
  });

  it("has exactly one door, and it's the recliner", () => {
    expect(HOTSPOTS.filter((h) => h.action === "sit").map((h) => h.id)).toEqual(["chair"]);
  });

  it("crops every portrait out of the photograph, inside the photograph", () => {
    for (const h of HOTSPOTS) {
      if (!h.crop) continue;
      const c = h.crop;
      expect(c.w, h.id).toBeGreaterThan(0);
      expect(c.h, h.id).toBeGreaterThan(0);
      expect(c.x + c.w, h.id).toBeLessThanOrEqual(1);
      expect(c.y + c.h, h.id).toBeLessThanOrEqual(1);
    }
  });
});

describe("walking", () => {
  it("never walks through the shelves", () => {
    let p = { x: 0.2, y: 0.5 };
    // March west until the left wall of shelves says no. Frame-sized steps —
    // the point of this is the walk a player actually gets, not a step big
    // enough to tunnel through a wall.
    for (let i = 0; i < 400; i += 1) p = stepWalk(p, { x: -1, y: 0 }, 0.016);
    expect(p.x).toBeGreaterThan(FLOOR.x);
    expect(overlaps(p, CHARACTER_R)).toBe(false);
  });

  it("never walks onto the recliner", () => {
    let p = { x: 0.52, y: 0.9 };
    for (let i = 0; i < 400; i += 1) p = stepWalk(p, { x: 0, y: -1 }, 0.016);
    expect(overlaps(p, CHARACTER_R)).toBe(false);
  });

  it("stays on the carpet however long you walk in one direction", () => {
    let p = { x: 0.5, y: 0.5 };
    for (let i = 0; i < 400; i += 1) p = stepWalk(p, { x: 1, y: 1 }, 0.016);
    expect(p.x).toBeLessThanOrEqual(FLOOR.x + FLOOR.w + 1e-9);
    expect(p.y).toBeLessThanOrEqual(FLOOR.y + FLOOR.h + 1e-9);
  });

  it("stands still when there is no direction", () => {
    const p = { x: 0.5, y: 0.5 };
    expect(stepWalk(p, { x: 0, y: 0 }, 0.1, 1)).toEqual(p);
  });
});

describe("collisions", () => {
  it("pushes a centre that lands inside furniture out of the nearest face", () => {
    const inside = { x: 0.52, y: 0.69 }; // the middle of the recliner
    const out = resolveCollision(inside, CHARACTER_R);
    expect(overlaps(out, CHARACTER_R)).toBe(false);
  });

  it("leaves a point that was already clear alone", () => {
    const clear = { x: 0.5, y: 0.5 };
    expect(resolveCollision(clear, CHARACTER_R)).toEqual(clear);
  });
});

describe("reaching things", () => {
  it("knows what you're standing next to", () => {
    expect(hotspotAt({ x: 0.52, y: 0.86 })?.id).toBe("chair");
    expect(hotspotAt({ x: 0.5, y: 0.55 })?.id).toBe("rug");
  });

  it("says nothing when you're in the middle of the carpet", () => {
    expect(hotspotAt({ x: 0.3, y: 0.75 })).toBeNull();
  });

  it("clamps a tap anywhere to the carpet", () => {
    expect(tapTarget({ x: -1, y: -1 })).toEqual({ x: FLOOR.x, y: FLOOR.y });
    expect(tapTarget({ x: 2, y: 2 })).toEqual({ x: FLOOR.x + FLOOR.w, y: FLOOR.y + FLOOR.h });
    expect(tapTarget({ x: 0.5, y: 0.5 })).toEqual({ x: 0.5, y: 0.5 });
  });
});
