// Deep Cut Theatre — the monthly showcase of award-winning indie films.
//
// Every title here is embedded from the filmmaker's own Vimeo or YouTube post
// through the official player. Nothing is hosted, copied or re-uploaded: the
// creator keeps their plays, their analytics and their control, and if they
// pull a film it stops playing here the same minute. That is the whole basis on
// which this is allowed to exist, so it is not a detail to optimise away later.
//
// The programme itself lives in Postgres (the `shorts` table, migration 0008)
// and is edited from the Projection Booth's Theatre tab — not in the app
// bundle, and not even in a deploy, so rotating the bill monthly is an admin
// action rather than a release.
//
// Pedigree lines are transcribed from each film's own festival record and say
// exactly what the record says. "Shortlisted" is not "nominated" and neither is
// "won" — a scraped description will happily blur all three, and a curator who
// repeats that blur is just lying more slowly.

/**
 * The room the television sits in.
 *
 * The picture is drawn OVER the photograph, clipped to the screen's rectangle —
 * not behind a transparent hole. That was the original plan and it was worse:
 * it demanded an alpha channel cut precisely around a CRT's rounded corners,
 * for the sole benefit of letting the glass sit over the video. Compositing on
 * top means any flat image works, including one straight out of a generator
 * with a blue Warner Bros. screen still on it.
 *
 * Geometry is fractions of the image, so it lands correctly at any width
 * without measuring the bitmap, and tuning the composition is a handful of
 * numbers on the server rather than an App Store release.
 *
 * `image: null` falls back to the plain cabinet, as does an image that fails to
 * load: a missing photograph must not take the room down with it.
 */

/**
 * One key on the console. The console is a photograph, not a layout — the keys
 * are painted into it and can't be moved — so what ships is a hit rectangle per
 * key, measured off the image and stored as fractions of it. The action is a
 * name rather than a function because the same rectangles are read by the web
 * and by the app, which wire them to their own handlers.
 */
export interface DashKey {
  action:
    | "power"
    | "num"
    | "ch-up"
    | "ch-down"
    | "eject"
    | "mute"
    | "guide"
    | "exit"
    | "source"
    | "vol-down"
    | "vol-up";
  /** Which channel, for the numbered keys. */
  n?: number;
  /** Spoken by a screen reader, since the key itself is pixels. */
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Dash {
  image: string;
  /** width / height of the console photograph. */
  aspect: number;
  /** Where it sits in the view. */
  x: number;
  bottom: number;
  w: number;
  /**
   * Degrees of tilt toward the viewer, about the console's own bottom edge.
   * The photograph is taken looking down at a steep angle; a few degrees the
   * other way stands its face up without making it look like a poster.
   */
  tilt: number;
  /**
   * The projector lens, as fractions of the console. The hologram is drawn
   * standing on this rather than baked into the photograph, because a
   * photograph of a hologram doesn't turn.
   */
  dome: { x: number; y: number };
  keys: DashKey[];
}

export interface Scene {
  image: string | null;
  /** width / height of the photograph itself. */
  aspect: number;
  /**
   * width / height of the window you look through. Narrower than the
   * photograph, which is the whole point: the difference is how far you can
   * turn your head. The room is a wide shot, the view is a slice of it, and
   * swiping slides the slice.
   */
  view: number;
  /**
   * How much taller than the window the room is drawn. Above 1 it is a push-in:
   * the set gets bigger and the sweep gets longer, at the cost of the ceiling.
   * Anchored to the bottom of the frame, so the lap and the cereal — the whole
   * reason it's a point of view and not a photograph — never crop away.
   */
  zoom: number;
  /** The television's screen, as fractions of the photograph. */
  screen: { x: number; y: number; w: number; h: number };
  /**
   * Where the eyes rest, as fractions of the ROOM. Derived from the set used
   * to be good enough, back when the set was the only thing worth framing;
   * now the console has to sit at the bottom of the view with the chair's own
   * arms still showing either side of it, and that wants the frame pushed
   * down further than the television alone would ask for.
   */
  eye: { x: number; y: number };
  /**
   * The console, as fractions of the VIEW rather than the photograph — it is
   * bolted to the chair, not to the room. Turning your head doesn't move the
   * armrest, and controls that could be looked away from would be a dead end:
   * no keys, no way back.
   */
  dash: Dash;
  /**
   * A crop of the same photograph tight around the television, for the Now
   * Showing card on Tonight. Only this rectangle is stored: where the screen
   * falls inside it is derived from `screen`, so a tweak to one can't leave the
   * other pointing at the wall.
   */
  card: { x: number; y: number; w: number; h: number };
}

export const SCENE: Scene = {
  // The ?v is not decoration. expo-image and every browser cache this by URL,
  // and the room has been re-cut more than once at the same path — which puts
  // a stale photograph behind live coordinates, so the picture floats in the
  // middle of the room with no television under it. BUMP IT whenever the file
  // on disk changes.
  image: "/scene/room.jpg?v=3",
  // One exposure this time, and a symmetrical one: the set dead centre at 49.6%
  // with a wall of it either side. Nothing is stitched, so nothing can seam.
  aspect: 1774 / 887,
  view: 0.85,
  // Pulled back from 1.7 to make room for the console. At 1.7 the frame ended
  // just below the television and the chair was entirely out of shot, which is
  // fine for a set on its own and useless once there is a console bolted to the
  // arms of a recliner you are supposed to be sitting in.
  zoom: 1.5,
  // The lit glass, read off a gridded blow-up rather than guessed at by an edge
  // detector — two automated attempts got this wrong in opposite directions,
  // one stopping short of the tube and one running past it into the cabinet.
  // Blue runs x 793-967, y 347-468; this is that plus three pixels of bleed,
  // so the film covers every lit pixel and no hairline survives around it.
  screen: { x: 0.4453, y: 0.3878, w: 0.1015, h: 0.1443 },
  // Horizontally on the set; vertically near the floor of the room, which is
  // what puts the recliner in the bottom of the frame instead of below it.
  eye: { x: 0.496, y: 0.667 },
  dash: {
    image: "/scene/dash.webp?v=1",
    aspect: 1199 / 325,
    // A hair wider than the view and flush to the bottom. The bleed is not
    // decoration: the console is a fixed photograph, so the only way to make
    // its painted keys bigger is to run it past the edges of the frame.
    // Bleeding wider than the view is the only way to make painted keys
    // bigger — they can't be re-laid-out, so the picture has to grow and the
    // frame has to crop it. Past about 1.2 the VOLUME and MENU panels start
    // going over the edges, so this is roughly the ceiling.
    x: -0.09,
    bottom: 0,
    w: 1.18,
    tilt: 11,
    dome: { x: 0.4779, y: 0.2738 },
    // Measured off a gridded blow-up of the console, then widened a little
    // past the painted edges — the keys are ~17pt across at this size, and a
    // hit box that stops exactly where the paint does would be unhittable.
    keys: [
      { action: "power", label: "Power", x: 0.1658, y: 0.1864, w: 0.06844, h: 0.1972 },
      { action: "source", label: "Source: TV", x: 0.1039, y: 0.428, w: 0.06726, h: 0.174 },
      { action: "source", label: "Source: AV", x: 0.1539, y: 0.428, w: 0.06726, h: 0.174 },
      { action: "source", label: "Source: AUX", x: 0.2059, y: 0.428, w: 0.06726, h: 0.174 },
      { action: "vol-down", label: "Volume down", x: 0.0514, y: 0.7596, w: 0.0472, h: 0.1508 },
      { action: "vol-up", label: "Volume up", x: 0.1904, y: 0.7596, w: 0.0472, h: 0.1508 },
      { action: "num", n: 1, label: "Channel 1", x: 0.3323, y: 0.4698, w: 0.06136, h: 0.2204 },
      { action: "num", n: 2, label: "Channel 2", x: 0.3973, y: 0.4698, w: 0.06136, h: 0.2204 },
      { action: "num", n: 3, label: "Channel 3", x: 0.4613, y: 0.4698, w: 0.06136, h: 0.2204 },
      { action: "num", n: 4, label: "Channel 4", x: 0.5263, y: 0.4698, w: 0.06136, h: 0.2204 },
      { action: "num", n: 5, label: "Channel 5", x: 0.5913, y: 0.4698, w: 0.06136, h: 0.2204 },
      { action: "num", n: 6, label: "Channel 6", x: 0.3283, y: 0.6478, w: 0.06136, h: 0.2204 },
      { action: "num", n: 7, label: "Channel 7", x: 0.3933, y: 0.6478, w: 0.06136, h: 0.2204 },
      { action: "num", n: 8, label: "Channel 8", x: 0.4573, y: 0.6478, w: 0.06136, h: 0.2204 },
      { action: "num", n: 9, label: "Channel 9", x: 0.5343, y: 0.6478, w: 0.06136, h: 0.2204 },
      { action: "num", n: 10, label: "Channel 10", x: 0.605, y: 0.6478, w: 0.06608, h: 0.2204 },
      { action: "ch-up", label: "Channel up", x: 0.7674, y: 0.1972, w: 0.0472, h: 0.1856 },
      { action: "eject", label: "Eject — another film on this channel", x: 0.7617, y: 0.2772, w: 0.05664, h: 0.1856 },
      { action: "ch-down", label: "Previous channel", x: 0.7238, y: 0.3104, w: 0.04248, h: 0.1392 },
      { action: "ch-up", label: "Next channel", x: 0.8158, y: 0.3104, w: 0.04248, h: 0.1392 },
      { action: "ch-down", label: "Channel down", x: 0.7714, y: 0.4412, w: 0.0472, h: 0.1276 },
      { action: "mute", label: "Mute", x: 0.7437, y: 0.7288, w: 0.05664, h: 0.1624 },
      { action: "guide", label: "Menu — what's on", x: 0.822, y: 0.7354, w: 0.06608, h: 0.1392 },
      { action: "exit", label: "Exit", x: 0.889, y: 0.7354, w: 0.06608, h: 0.1392 },
    ],
  },
  // Square in pixels (284x284), because the Tonight card draws it into a square
  // box and would otherwise stretch the set sideways.
  card: { x: 0.4161, y: 0.2999, w: 0.16, h: 0.3202 },
};

export type ChannelKey =
  | "late"
  | "drawn"
  | "true"
  | "heart"
  | "funny"
  | "grown"
  | "loud"
  | "wrong"
  | "future"
  | "front"
  | "sound"
  | "wild"
  | "over"
  | "rails";

export interface Channel {
  key: ChannelKey;
  glyph: string;
  label: string;
  /** One line, on the channel guide. */
  blurb: string;
}

export const CHANNELS: Channel[] = [
  // The key stays "late" — every film record points at it — but the label can't:
  // a channel called The Late Show inside Deep Cut Theatre reads as a rename
  // somebody only half finished.
  { key: "late", glyph: "🌙", label: "Midnight", blurb: "Dread, and things that don't explain themselves." },
  { key: "heart", glyph: "❤️", label: "Heartache", blurb: "Families, and the damage done." },
  { key: "true", glyph: "📼", label: "True Stories", blurb: "All of this happened." },
  { key: "drawn", glyph: "✏️", label: "Drawn", blurb: "Made a frame at a time." },
  { key: "funny", glyph: "🎭", label: "Deadpan", blurb: "Funny, and nobody on screen seems to notice." },
  { key: "grown", glyph: "🩹", label: "Bad Skin, Big Feelings", blurb: "Everybody's most embarrassing year, projected in public." },
  { key: "loud", glyph: "🏳️‍🌈", label: "Out Loud", blurb: "Coming out never once, apparently." },
  { key: "wrong", glyph: "🕵️", label: "The Tell", blurb: "Somebody gave themselves away, and didn't know it yet." },
  { key: "future", glyph: "🛸", label: "Tomorrow's Problem", blurb: "The future, several bad decisions ahead of us." },
  { key: "front", glyph: "🪖", label: "Shrapnel", blurb: "What's left in a person, after the war moves on." },
  { key: "sound", glyph: "🎧", label: "Needle Drop", blurb: "The soundtrack came first." },
  { key: "wild", glyph: "🐊", label: "Apex", blurb: "Nature, and its complete lack of a moral centre." },
  { key: "over", glyph: "⏱️", label: "The Buzzer", blurb: "Nobody remembers who won. Everybody remembers the buzzer." },
  { key: "rails", glyph: "🎪", label: "Off the Rails", blurb: "Nobody explained this one to the budget." },
];

// For the admin routes' validation — derived rather than retyped, so adding a
// channel here is the only place that needs touching. The cast is safe: the
// array above is never empty.
export const CHANNEL_KEYS = CHANNELS.map((c) => c.key) as [ChannelKey, ...ChannelKey[]];

export interface Short {
  /** Stable slug — the key for ratings and watch history. */
  id: string;
  title: string;
  director: string;
  year: number;
  runtimeSec: number;
  source: "vimeo" | "youtube";
  videoId: string;
  channels: ChannelKey[];
  /** The festival record, stated precisely. */
  pedigree: string;
  /** What it's about, in the filmmaker's own framing. */
  synopsis: string;
  /** A frame from the film, for the television's screen on the Tonight card. */
  thumb: string;
}

// The programme itself now lives in the `shorts` table (migration 0008), not
// here — the Projection Booth's Theatre tab writes rows directly, and rotating
// the bill monthly stopped being a deploy. See src/lib/shorts-admin.ts for the
// read/write layer and src/app/api/shorts/route.ts for the public read.

/** "14 MIN" — the runtime as it reads on a channel guide. */
export function runtimeLabel(sec: number): string {
  return `${Math.max(1, Math.round(sec / 60))} MIN`;
}

// ── This week's feature ──────────────────────────────────────────────
//
// A monthly bill gives somebody one reason a month to come back, which is too
// slow to become a habit. The same films, released on a weekly rhythm, give
// four — no new content, no extra curation, no admin step.
//
// The pick is derived rather than stored: the same week always resolves to the
// same film, for everybody, with nothing to schedule and nothing to go stale.
// Change the bill and next Monday picks up the new one on its own.

/**
 * Weeks since the Unix epoch, counted from a Monday.
 *
 * 1 Jan 1970 was a Thursday, so the epoch sits 3 days into its week; shifting
 * by those days makes every boundary land on a Monday UTC. A film that changes
 * mid-Saturday-evening would be a film that changes during the one session it
 * was picked for.
 */
export function weekIndex(now: Date = new Date()): number {
  const DAY = 86400_000;
  return Math.floor((now.getTime() + 3 * DAY) / (7 * DAY));
}

/**
 * This week's feature from the current bill, or null if the bill is empty.
 *
 * Rotates one step a week through the list in the order it's given, so over a
 * month with a full bill every film gets its turn rather than the same
 * handful surfacing repeatedly.
 */
export function featureOfWeek<T>(bill: T[], now: Date = new Date()): T | null {
  if (!bill.length) return null;
  // Modulo of a positive count is always in range; weekIndex is positive for
  // any date after 1970, and a negative one would still be handled by the
  // second modulo rather than throwing an index error.
  const i = ((weekIndex(now) % bill.length) + bill.length) % bill.length;
  return bill[i];
}
