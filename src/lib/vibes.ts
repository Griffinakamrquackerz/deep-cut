// Tonight's-vibe catalog. A vibe steers a deal without replacing taste: the
// LLM gets the hint sentence, the Discover fallback gets the genre ids, and
// the user's taste threads still decide WHICH films inside the vibe.

export interface Vibe {
  key: string;
  /** Chip label — marquee voice, keep it short. */
  label: string;
  emoji: string;
  /** One sentence injected into the rec prompt describing tonight's mood. */
  hint: string;
  /** TMDB genre ids for the vault (Discover) fallback. */
  genreIds: number[];
  /**
   * Channel overrides for Just Roll It. The deal fallback ORs genreIds, which
   * is fine when taste threads then pick WITHIN the pool — but the channel
   * shows the pool raw, so tone-breakers must be cut at the query.
   */
  rollGenreIds?: number[]; // tighter genre set for the channel (default: genreIds)
  avoidGenreIds?: number[]; // genres that break the channel's tone
}

export const VIBES: Vibe[] = [
  {
    key: "laugh",
    label: "Make me laugh",
    emoji: "🤡",
    hint: "Comedies only — anything from dry deadpan to full slapstick, as long as it's genuinely funny.",
    genreIds: [35],
    avoidGenreIds: [10751, 16],
  },
  {
    key: "scare",
    label: "Scare me",
    emoji: "🔪",
    hint: "Horror night — dread, jump scares, creeping unease. Elevated or trashy both welcome.",
    genreIds: [27, 53],
    avoidGenreIds: [10751, 16],
  },
  {
    key: "cry",
    label: "Emotional damage",
    emoji: "😭",
    hint: "Films that hit hard emotionally — grief, longing, bittersweet endings, catharsis.",
    genreIds: [18, 10749],
    avoidGenreIds: [28, 80, 27],
  },
  {
    key: "mind",
    label: "Melt my brain",
    emoji: "🌀",
    hint: "Mind-benders — puzzle plots, unreliable narrators, sci-fi concepts, films you argue about after.",
    genreIds: [878, 9648, 53],
    avoidGenreIds: [28, 10751, 16],
  },
  {
    key: "edge",
    label: "Edge of my seat",
    emoji: "💥",
    hint: "Relentless tension — thrillers, heists, chases, ticking clocks. Momentum over meditation.",
    genreIds: [53, 80, 28],
    avoidGenreIds: [10751, 16],
  },
  {
    key: "cozy",
    label: "Cozy night in",
    emoji: "🍿",
    hint: "Comfort viewing — warm, low-stakes, charming. Nothing bleak, nothing stressful.",
    genreIds: [35, 10751, 10749],
    avoidGenreIds: [27, 53, 80],
  },
  {
    key: "weird",
    label: "Get weird",
    emoji: "👽",
    hint: "Surreal, cult, midnight-movie energy — the strange and singular. The weirder the better.",
    genreIds: [14, 878, 27],
    avoidGenreIds: [10751, 16],
  },
  {
    key: "swoon",
    label: "Swoon",
    emoji: "💘",
    hint: "Romance front and center — chemistry, yearning, grand gestures or quiet intimacy.",
    genreIds: [10749, 18],
    rollGenreIds: [10749],
    avoidGenreIds: [27, 53],
  },
  {
    key: "journey",
    label: "Take me somewhere",
    emoji: "🗺️",
    hint: "Transporting films — adventures, sweeping settings, other countries and eras. Escape hatch cinema.",
    genreIds: [12, 14, 36],
    avoidGenreIds: [16, 10751],
  },
  {
    key: "true",
    label: "Stranger than fiction",
    emoji: "🎙️",
    hint: "Documentaries and true stories — real people, real events, stranger than anything scripted.",
    genreIds: [99, 36, 18],
    rollGenreIds: [99, 36],
  },
];

export const VIBE_KEYS = VIBES.map((v) => v.key) as [string, ...string[]];

export function vibeByKey(key: string | null | undefined): Vibe | null {
  if (!key) return null;
  return VIBES.find((v) => v.key === key) ?? null;
}
