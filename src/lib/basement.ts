// The basement, as a floor plan.
//
// Deep Cut Theatre has two rooms and one route. This is the lobby: the real
// basement, seen from where you stand, where every nostalgic object on the
// walls and shelves is a hotspot with a write-up, and the recliner is a door —
// sitting in it hands you to the chair's-eye room in app/tv/LateShow.tsx,
// which is where the films actually play.
//
// Geometry is fractions of the map, exactly like SCENE in lib/shorts.ts, so it
// lands right at any size without measuring anything. The layout is derived
// from the chair's-eye photograph: the prop positions follow where those
// objects actually are, and the `crop` rectangles are regions of that same
// photograph, so a blurb card shows the real object and not a stock photo.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * The carpet. Everything the character is allowed to stand on. The walls are
 * the band outside it; the shelves run along them and are furniture, not wall.
 */
export const FLOOR: Rect = { x: 0.1, y: 0.15, w: 0.8, h: 0.8 };

/** How wide the map is relative to how tall it is. */
export const MAP_ASPECT = 4 / 3;

/** The character's radius, in the same fractions. */
export const CHARACTER_R = 0.03;

/** How fast the character walks, in fractions per second. */
export const WALK_SPEED = 0.26;

/**
 * The things the character walks around. The rug is deliberately absent —
 * you walk over a rug.
 */
export const FURNITURE: Rect[] = [
  { x: 0.12, y: 0.05, w: 0.18, h: 0.1 }, // left of the set — figures, Star Wars
  { x: 0.39, y: 0.04, w: 0.22, h: 0.12 }, // the CRT in its cabinet
  { x: 0.7, y: 0.05, w: 0.18, h: 0.1 }, // right of the set — Jurassic Park, VHS
  { x: 0.02, y: 0.2, w: 0.07, h: 0.62 }, // the left wall of shelves
  { x: 0.91, y: 0.2, w: 0.07, h: 0.62 }, // the right wall of shelves
  { x: 0.62, y: 0.04, w: 0.07, h: 0.11 }, // the arcade cabinet — the newest fixture in the room
  { x: 0.4, y: 0.58, w: 0.24, h: 0.22 }, // the recliner
];

export interface Hotspot {
  id: string;
  label: string;
  /** Where it sits on the map — drawn there, and where the prompt points. */
  pin: Rect;
  /** Where you stand to reach it. */
  x: number;
  y: number;
  /** How close you have to be, in the same fractions. */
  r: number;
  /** A glyph for the map pin. The room already speaks in emoji channel glyphs. */
  glyph: string;
  tint: string;
  /** The write-up, in the founder's own voice. */
  blurb: string;
  /** A crop of the chair's-eye photograph, for the blurb card's portrait. */
  crop?: { x: number; y: number; w: number; h: number };
  /** Sitting down is not looking at something. */
  action?: "sit";
}

export const HOTSPOTS: Hotspot[] = [
  {
    id: "star-wars",
    label: "STAR WARS",
    pin: { x: 0.13, y: 0.03, w: 0.16, h: 0.09 },
    x: 0.21,
    y: 0.22,
    r: 0.1,
    glyph: "🚀",
    tint: "#2b3a55",
    blurb:
      "This poster predates the words “Episode” anything. It came home from a yard sale for a dollar and has hung over the shelf ever since, which makes it the oldest fixture in the room and the one everybody photographs first.",
    crop: { x: 0.315, y: 0.27, w: 0.06, h: 0.18 },
  },
  {
    id: "crt",
    label: "THE SET",
    pin: { x: 0.39, y: 0.04, w: 0.22, h: 0.12 },
    x: 0.5,
    y: 0.26,
    r: 0.1,
    glyph: "📺",
    tint: "#5a2b16",
    blurb:
      "A 27-inch tube in a wooden cabinet, four-head hi-fi, and a front-loader that takes a tape with a mechanical clunk you can feel from the kitchen. Fourteen channels of award-winning shorts, and everything in this room points at it.",
    crop: { x: 0.415, y: 0.32, w: 0.15, h: 0.31 },
  },
  {
    id: "jurassic",
    label: "JURASSIC PARK",
    pin: { x: 0.71, y: 0.03, w: 0.16, h: 0.09 },
    x: 0.79,
    y: 0.22,
    r: 0.1,
    glyph: "🦖",
    tint: "#24401f",
    blurb:
      "“Life finds a way” is a line about chaos theory delivered by a man holding a flask. The T. rex was mostly mechanical, which is why it still looks wet and heavy and real in a way nothing generated since quite manages.",
    crop: { x: 0.595, y: 0.19, w: 0.095, h: 0.26 },
  },
  {
    id: "goonies",
    label: "THE GOONIES",
    pin: { x: 0.02, y: 0.02, w: 0.1, h: 0.1 },
    x: 0.16,
    y: 0.21,
    r: 0.1,
    glyph: "🗺️",
    tint: "#7a5a2a",
    blurb:
      "One-eyed Willy's map, a dead avalanche, and a truffle shuffle. Every bad idea in this film is committed by a child and rewarded with pirate gold, which is the entire reason anybody in this room is like this.",
    crop: { x: 0.0, y: 0.02, w: 0.1, h: 0.3 },
  },
  {
    id: "ghostbusters",
    label: "GHOSTBUSTERS",
    pin: { x: 0.13, y: 0.02, w: 0.1, h: 0.1 },
    x: 0.22,
    y: 0.21,
    r: 0.1,
    glyph: "👻",
    tint: "#7a2020",
    blurb:
      "A proton pack is a nuclear accelerator strapped to the back of a man who failed out of grad school. The firehouse is real, the library scene still holds, and nobody has ever satisfactorily explained the pink slime.",
    crop: { x: 0.1, y: 0.03, w: 0.095, h: 0.32 },
  },
  {
    id: "little-shop",
    label: "LITTLE SHOP OF HORRORS",
    pin: { x: 0.02, y: 0.44, w: 0.07, h: 0.1 },
    x: 0.13,
    y: 0.49,
    r: 0.09,
    glyph: "🌱",
    tint: "#2a4a20",
    blurb:
      "Feed me, Seymour. A man-eating plant from outer space, a downtown flower shop, and a doo-wop Greek chorus narrating the whole slide into damnation. The theatrical cut is the happy one. The director's cut is the true one.",
    crop: { x: 0.2, y: 0.1, w: 0.09, h: 0.3 },
  },
  {
    id: "tmnt",
    label: "TEENAGE MUTANT NINJA TURTLES",
    pin: { x: 0.02, y: 0.56, w: 0.07, h: 0.1 },
    x: 0.13,
    y: 0.61,
    r: 0.09,
    glyph: "🐢",
    tint: "#1f5a2a",
    blurb:
      "Four brothers named after Renaissance painters who fight crime out of a storm drain and eat pizza. The toy line ran into the hundreds of figures; this van is one of the few survivors of the yard.",
    crop: { x: 0.095, y: 0.39, w: 0.11, h: 0.13 },
  },
  {
    id: "lite-brite",
    label: "LITE-BRITE",
    pin: { x: 0.02, y: 0.68, w: 0.07, h: 0.1 },
    x: 0.13,
    y: 0.73,
    r: 0.09,
    glyph: "💡",
    tint: "#3a2a6a",
    blurb:
      "Coloured pegs punched through black paper against a glowing screen. Released in 1967, it was a pixel display running on a 15-watt bulb and patience — thirty years before anybody called that a hobby. Half the fun was the refill sheets; the other half was freeing the pegs from the carpet.",
    crop: { x: 0.11, y: 0.48, w: 0.075, h: 0.14 },
  },
  {
    id: "staypuft",
    label: "STAY PUFT",
    pin: { x: 0.02, y: 0.8, w: 0.07, h: 0.1 },
    x: 0.13,
    y: 0.85,
    r: 0.09,
    glyph: "☁️",
    tint: "#6a6a72",
    blurb:
      "The mascot of a fictional marshmallow company, chosen by a destroyer because it was the softest, most harmless thing in Venkman's head. Choose the form of the destructor — and this is what walks up Fifth Avenue.",
    crop: { x: 0.0, y: 0.37, w: 0.06, h: 0.16 },
  },
  {
    id: "spacejam",
    label: "SPACE JAM",
    pin: { x: 0.91, y: 0.2, w: 0.07, h: 0.1 },
    x: 0.87,
    y: 0.25,
    r: 0.09,
    glyph: "🏀",
    tint: "#1f2a4a",
    blurb:
      "Michael Jordan joins the Looney Tunes because aliens challenged them to settle an intergalactic theme-park dispute by playing basketball. It should not work. It works. The soundtrack outsold the plot's logic and made it everybody's childhood.",
    crop: { x: 0.75, y: 0.12, w: 0.085, h: 0.35 },
  },
  {
    id: "pokemon",
    label: "POKÉMON",
    pin: { x: 0.91, y: 0.32, w: 0.07, h: 0.1 },
    x: 0.87,
    y: 0.37,
    r: 0.09,
    glyph: "⚡",
    tint: "#8a6a10",
    blurb:
      "“Gotta catch 'em all” was a business model disguised as a moral imperative. One hundred and fifty-one originals, and thirty years later everybody in the room still knows exactly which one was theirs.",
    crop: { x: 0.84, y: 0.09, w: 0.09, h: 0.35 },
  },
  {
    id: "jason",
    label: "THE MASK",
    pin: { x: 0.91, y: 0.44, w: 0.07, h: 0.1 },
    x: 0.87,
    y: 0.49,
    r: 0.09,
    glyph: "🎭",
    tint: "#6a5a10",
    blurb:
      "Not the real one — the real one is at the bottom of Crystal Lake, or in a warehouse in Hollywood, depending who you ask. This one came off a shop wall and has watched every scary film in this room from the right-hand side.",
    crop: { x: 0.795, y: 0.55, w: 0.07, h: 0.16 },
  },
  {
    id: "rangers",
    label: "MIGHTY MORPHIN POWER RANGERS",
    pin: { x: 0.91, y: 0.56, w: 0.07, h: 0.1 },
    x: 0.87,
    y: 0.61,
    r: 0.09,
    glyph: "⚔️",
    tint: "#a01f1f",
    blurb:
      "Teenagers with attitude spliced together with Japanese stunt footage — two entirely separate shows welded into one, and the visible weld is the whole charm. Six colours, one robot made of dinosaurs, and it's Morphin Time.",
    crop: { x: 0.88, y: 0.49, w: 0.08, h: 0.16 },
  },
  {
    id: "supersoaker",
    label: "SUPER SOAKER",
    pin: { x: 0.91, y: 0.68, w: 0.07, h: 0.1 },
    x: 0.87,
    y: 0.73,
    r: 0.09,
    glyph: "💦",
    tint: "#1f5a8a",
    blurb:
      "An air-pressure water cannon invented by a NASA engineer. Lonnie Johnson worked on the Galileo probe to Jupiter and then, in his bathroom, invented the single greatest summer toy ever sold. Fairness ended in 1990.",
    crop: { x: 0.745, y: 0.45, w: 0.14, h: 0.17 },
  },
  {
    id: "lava",
    label: "THE LAVA LAMP",
    pin: { x: 0.91, y: 0.8, w: 0.07, h: 0.1 },
    x: 0.87,
    y: 0.85,
    r: 0.09,
    glyph: "🌋",
    tint: "#8a2a10",
    blurb:
      "Invented in 1963 by a man who was trying to build a better egg timer out of a cocktail shaker full of wax. It has never once told the time. It has been worth it every single evening since.",
    crop: { x: 0.95, y: 0.4, w: 0.05, h: 0.22 },
  },
  {
    id: "phone",
    label: "THE ROTARY PHONE",
    pin: { x: 0.88, y: 0.86, w: 0.08, h: 0.07 },
    x: 0.84,
    y: 0.9,
    r: 0.08,
    glyph: "☎️",
    tint: "#8a1f1f",
    blurb:
      "A dial you had to earn — nine for anything beginning with W, a full second of your life per digit, and a wire that meant somebody's mother might pick up first. Still the best UI ever shipped for calling one place and waiting.",
    crop: { x: 0.895, y: 0.62, w: 0.1, h: 0.15 },
  },
  {
    id: "rug",
    label: "BLOCKBUSTER VIDEO",
    pin: { x: 0.36, y: 0.34, w: 0.28, h: 0.16 },
    x: 0.5,
    y: 0.55,
    r: 0.12,
    glyph: "📼",
    tint: "#1c4f9c",
    blurb:
      "Be kind, rewind. Blue and yellow used to mean a Friday night and a decision made standing in an aisle, reading the back of a box. The late fees funded an empire, and the late fees also killed it.",
    crop: { x: 0.355, y: 0.62, w: 0.27, h: 0.17 },
  },
  {
    id: "arcade",
    label: "THE ARCADE CABINET",
    pin: { x: 0.61, y: 0.02, w: 0.09, h: 0.13 },
    x: 0.665,
    y: 0.22,
    r: 0.12,
    glyph: "🕹️",
    tint: "#0d1b2a",
    blurb:
      "A cabinet with a lit marquee, a hungry coin door, and an empty cart slot — the games get uploaded soon. Until then it takes your quarter and gives you the honour of being first in line.",
  },
  {
    id: "chair",
    label: "THE RECLINER",
    pin: { x: 0.4, y: 0.58, w: 0.24, h: 0.22 },
    x: 0.52,
    y: 0.86,
    r: 0.1,
    glyph: "🛋️",
    tint: "#8a6a4a",
    blurb:
      "The best seat in the house, positioned exactly one room-length from the tube with the console bolted to the arm. Sit down and the theatre starts — the lights go down and the bill comes on.",
    crop: { x: 0.34, y: 0.74, w: 0.37, h: 0.26 },
    action: "sit",
  },
];

/** Clamp a point inside the carpet. */
export function clampToFloor(p: Point): Point {
  return {
    x: Math.min(FLOOR.x + FLOOR.w, Math.max(FLOOR.x, p.x)),
    y: Math.min(FLOOR.y + FLOOR.h, Math.max(FLOOR.y, p.y)),
  };
}

/**
 * Push a circle out of everything it overlaps, then back inside the carpet.
 *
 * Circle-versus-rect: find the closest point of the rect to the circle's
 * centre; if that point is closer than the radius, push straight out along the
 * line between them. A centre that lands inside a rect gets pushed out of the
 * nearest face, which is what a corner graze needs to feel like a wall and not
 * a teleport.
 */
export function resolveCollision(p: Point, radius: number, rects: Rect[] = FURNITURE): Point {
  let { x, y } = p;
  for (const r of rects) {
    const cx = Math.max(r.x, Math.min(x, r.x + r.w));
    const cy = Math.max(r.y, Math.min(y, r.y + r.h));
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 > radius * radius) continue;
    if (d2 === 0) {
      const left = x - r.x;
      const right = r.x + r.w - x;
      const top = y - r.y;
      const bottom = r.y + r.h - y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) x = r.x - radius;
      else if (m === right) x = r.x + r.w + radius;
      else if (m === top) y = r.y - radius;
      else y = r.y + r.h + radius;
    } else {
      const d = Math.sqrt(d2);
      x = cx + (dx / d) * radius;
      y = cy + (dy / d) * radius;
    }
  }
  return clampToFloor({ x, y });
}

/** Where a tap means: the tap, but on the carpet. */
export function tapTarget(to: Point): Point {
  return clampToFloor(to);
}

/**
 * The nearest hotspot you're close enough to reach. A hotspot's own radius
 * decides, so the recliner is generous and a shelf item is not.
 */
export function hotspotAt(p: Point): Hotspot | null {
  let best: { h: Hotspot; d: number } | null = null;
  for (const h of HOTSPOTS) {
    const d = Math.hypot(h.x - p.x, h.y - p.y);
    if (d <= h.r && (!best || d < best.d)) best = { h, d };
  }
  return best ? best.h : null;
}

/** Step one frame of walking, with collisions. Pure, so it's testable. */
export function stepWalk(from: Point, dir: Point, dt: number, speed = WALK_SPEED): Point {
  const len = Math.hypot(dir.x, dir.y);
  if (len === 0) return resolveCollision(from, CHARACTER_R);
  const unit = { x: dir.x / len, y: dir.y / len };
  return resolveCollision(
    { x: from.x + unit.x * speed * dt, y: from.y + unit.y * speed * dt },
    CHARACTER_R,
  );
}

// ── The room, point of view ─────────────────────────────────────────────────
//
// The floor plan above is still the map — it's what the corner floor plan
// draws. But you move through the room the way you actually would: looking
// around it. There is no character to push across a perspective photograph;
// the camera is you. Each Spot is a place to stand: `stand` is what
// hotspotAt() sees (so reach is the same maths walking ever used), and `cam`
// is the window of the photograph you look through from there.

/** The stage the photograph is shown on: the photo's own wide aspect. */
export const STAGE_ASPECT = 2;

/** The photograph itself (1774×887), so window maths finds real pixels. */
export const PHOTO_ASPECT = 1774 / 887;

/** How far the free look can pull back and push in. */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 2.6;

/**
 * Where the arcade cabinet stands in the photograph. It isn't in the
 * photograph — it's the room's newest fixture, drawn in place with a lit
 * marquee and an empty cart slot, waiting for the games to be uploaded.
 */
export const ARCADE_CABINET: Rect = { x: 0.685, y: 0.02, w: 0.07, h: 0.44 };

export interface Spot {
  id: string;
  label: string;
  /** Where you stand, in floor-plan UV — this is what hotspotAt() sees. */
  stand: Point;
  /** What the camera looks at: centre in photograph UV, and zoom. */
  cam: { cx: number; cy: number; zoom: number };
  /** The spots you can step to from here, by id. */
  links: string[];
}

/** Every place you can stand, and what you see from there. */
export const SPOTS: Spot[] = [
  {
    id: "chair",
    label: "The Recliner",
    stand: { x: 0.52, y: 0.86 },
    cam: { cx: 0.5, cy: 0.5, zoom: 1 },
    links: ["rug"],
  },
  {
    id: "rug",
    label: "The Middle of the Room",
    stand: { x: 0.5, y: 0.52 },
    cam: { cx: 0.5, cy: 0.42, zoom: 1.35 },
    links: ["chair", "set", "posters", "set-right", "wall-left-upper", "wall-right-mid"],
  },
  {
    id: "set",
    label: "In Front of the Set",
    stand: { x: 0.5, y: 0.26 },
    cam: { cx: 0.49, cy: 0.44, zoom: 2.3 },
    links: ["rug", "posters", "set-right", "arcade"],
  },
  {
    id: "posters",
    label: "The Poster Rail",
    stand: { x: 0.2, y: 0.23 },
    cam: { cx: 0.22, cy: 0.24, zoom: 2 },
    links: ["rug", "set", "wall-left-upper"],
  },
  {
    id: "set-right",
    label: "The VHS Shelf",
    stand: { x: 0.74, y: 0.24 },
    cam: { cx: 0.63, cy: 0.28, zoom: 2.2 },
    links: ["set", "arcade", "wall-right-upper", "rug"],
  },
  {
    id: "arcade",
    label: "The Arcade Cabinet",
    stand: { x: 0.665, y: 0.24 },
    cam: { cx: 0.72, cy: 0.22, zoom: 2.5 },
    links: ["set", "set-right"],
  },
  {
    id: "wall-left-upper",
    label: "The Left Shelves",
    stand: { x: 0.13, y: 0.55 },
    cam: { cx: 0.17, cy: 0.42, zoom: 2.3 },
    links: ["posters", "wall-left-lower", "rug"],
  },
  {
    id: "wall-left-lower",
    label: "The Left Wall, Down Low",
    stand: { x: 0.13, y: 0.79 },
    cam: { cx: 0.1, cy: 0.5, zoom: 2.3 },
    links: ["wall-left-upper"],
  },
  {
    id: "wall-right-upper",
    label: "The Right Shelves",
    stand: { x: 0.87, y: 0.31 },
    cam: { cx: 0.85, cy: 0.26, zoom: 2.3 },
    links: ["set-right", "wall-right-mid", "rug"],
  },
  {
    id: "wall-right-mid",
    label: "The Right Wall, Middle",
    stand: { x: 0.87, y: 0.55 },
    cam: { cx: 0.89, cy: 0.45, zoom: 2.3 },
    links: ["wall-right-upper", "wall-right-lower", "rug"],
  },
  {
    id: "wall-right-lower",
    label: "The Right Wall, Down Low",
    stand: { x: 0.87, y: 0.8 },
    cam: { cx: 0.86, cy: 0.55, zoom: 2.3 },
    links: ["wall-right-mid", "phone-nook"],
  },
  {
    id: "phone-nook",
    label: "The Phone Nook",
    stand: { x: 0.84, y: 0.88 },
    cam: { cx: 0.9, cy: 0.6, zoom: 2.5 },
    links: ["wall-right-lower"],
  },
];

export function spotById(id: string): Spot | undefined {
  return SPOTS.find((s) => s.id === id);
}

/**
 * The piece of the photograph a camera position looks through, in photograph
 * UV. Pure and clamped: any centre or zoom yields a window inside the
 * photograph, never empty, and never outside the zoom limits.
 */
export function cameraWindow(cam: { cx: number; cy: number; zoom: number }): Rect {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, cam.zoom));
  const w = 1 / zoom;
  const h = (w * STAGE_ASPECT) / PHOTO_ASPECT;
  return {
    x: Math.min(1 - w, Math.max(0, cam.cx - w / 2)),
    y: Math.min(1 - h, Math.max(0, cam.cy - h / 2)),
    w,
    h,
  };
}

/**
 * Everything you can reach from where you stand — the same distance maths
 * hotspotAt() uses, but the whole set rather than only the nearest one.
 */
export function reachableFrom(stand: Point): Hotspot[] {
  return HOTSPOTS.filter((h) => Math.hypot(h.x - stand.x, h.y - stand.y) <= h.r);
}
