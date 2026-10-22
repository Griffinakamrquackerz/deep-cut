// Tonight's-vibe catalog. A vibe steers a deal without replacing taste: the
// LLM gets the hint sentence, the Discover fallback gets the genre ids (and,
// for tone-based vibes, TMDB keyword names resolved to ids), and the user's
// taste threads still decide WHICH films inside the vibe.
//
// Design note (audit, 2026-07): TMDB genres are the right tool for vibes that
// ARE genres (scare→Horror, swoon→Romance, true→Documentary) — that's why
// "Scare me" is so consistent. But vibes that are a TONE, not a genre
// (mind-benders, weird, genuinely-funny) can't be sourced by genre alone —
// Enter the Void isn't "sci-fi". Those carry `keywords` so Discover can find
// the tone, and their hints name the tier so the LLM aims true.

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
   * TMDB keyword NAMES (resolved to ids at query time, cached). For tone vibes
   * where genre is the wrong instrument. OR-joined, and additive to genres —
   * a keyword pull is tried first, genre pulls top up, so counts never drop.
   */
  keywords?: string[];
  /**
   * Channel overrides for Just Roll It. The deal fallback ORs genreIds, which
   * is fine when taste threads then pick WITHIN the pool — but the channel
   * shows the pool raw, so tone-breakers must be cut at the query.
   */
  rollGenreIds?: number[]; // tighter genre set for the channel (default: genreIds)
  avoidGenreIds?: number[]; // genres that break the channel's tone
  /**
   * Genre-gate for validated candidates (LLM + keyword-only pulls): a film must
   * carry AT LEAST ONE of these to survive. Only set on vibes that ARE a genre
   * (laugh→Comedy, scare→Horror) — it's the fix for off-vibe bleed like a
   * romance-thriller landing on "Make me laugh". Left undefined on TONE vibes
   * (mind, weird, edge) whose best films deliberately cross genres.
   */
  requireGenreIds?: number[];
}

export const VIBES: Vibe[] = [
  {
    key: "laugh",
    label: "Make me laugh",
    emoji: "🤡",
    hint: "Genuinely, actually funny — sharp, absurd, or pitch-black, never lazy studio filler, rom-com fluff, or kids' movies. Deadpan, satire, screwball, cringe, cult comedy all welcome. Aim for the tier of Dr. Strangelove, The Nice Guys, What We Do in the Shadows, In Bruges.",
    genreIds: [35],
    keywords: ["satire", "dark comedy", "black comedy", "absurdism"],
    avoidGenreIds: [10751, 16],
    requireGenreIds: [35], // must actually be a comedy — no drama-with-jokes bleed
  },
  {
    key: "scare",
    label: "Scare me",
    emoji: "🔪",
    hint: "Horror night — dread, creeping unease, jump scares, body horror. Elevated arthouse dread or gnarly trash, both welcome — from Hereditary and The Witch to Evil Dead and Terrifier.",
    // Horror ONLY — in both the pull and the gate. Thriller(53) used to sit in
    // both, and because the gate accepts a film carrying ANY of requireGenreIds,
    // a pure thriller passed as horror: K.G.F: Chapter 1
    // (Action/Thriller/Adventure/Crime) and The Substitute
    // (Action/Crime/Drama/Thriller) both dealt under "Scare me". A thriller is
    // not a scare, and "Edge of my seat" already owns that register.
    genreIds: [27],
    keywords: ["supernatural", "slasher", "haunted house", "body horror"],
    rollGenreIds: [27],
    avoidGenreIds: [10751, 16],
    requireGenreIds: [27], // must actually be horror — no thriller bleed
  },
  {
    key: "cry",
    label: "Emotional damage",
    emoji: "😭",
    hint: "Films that gut you — grief, longing, bittersweet aches, hard-won catharsis. Emotional demolition, not sappy greeting-card stuff. The tier of Grave of the Fireflies, Manchester by the Sea, In the Mood for Love.",
    genreIds: [18, 10749],
    keywords: ["tearjerker", "grief", "terminal illness", "loss"],
    rollGenreIds: [18],
    avoidGenreIds: [28, 80, 27, 99],
    requireGenreIds: [18, 10749], // drama or romance — the emotional registers
  },
  {
    key: "mind",
    label: "Melt my brain",
    emoji: "🌀",
    hint: "Reality-dissolving mind-melters — surreal, hallucinatory, nonlinear, films you're still arguing about at 2am. Puzzle-box plots AND full psychedelic trips, not just tidy sci-fi twists. Aim for the tier of Enter the Void, Mulholland Drive, Primer, Synecdoche New York, Possession, Under the Skin.",
    genreIds: [878, 9648, 53, 14],
    keywords: ["surrealism", "psychedelic", "mind bending", "nonlinear timeline", "dream", "altered reality"],
    rollGenreIds: [878, 9648],
    avoidGenreIds: [10751, 16],
  },
  {
    key: "edge",
    label: "Edge of my seat",
    emoji: "💥",
    hint: "Relentless tension — thrillers, heists, chases, ticking clocks, not an ounce of fat. Momentum over meditation. The tier of Uncut Gems, Sicario, Wages of Fear, Prisoners.",
    genreIds: [53, 80, 28],
    keywords: ["heist", "cat and mouse", "suspense"],
    avoidGenreIds: [10751, 16],
  },
  {
    key: "cozy",
    label: "Cozy night in",
    emoji: "🍿",
    hint: "Comfort viewing — warm, charming, low-stakes, a blanket in film form. Nothing bleak or stressful. Gentle comedies, feel-good gems, Ghibli-adjacent warmth.",
    genreIds: [35, 10751, 10749],
    keywords: ["feel-good", "heartwarming", "friendship"],
    avoidGenreIds: [27, 53, 80],
  },
  {
    key: "weird",
    label: "Get weird",
    emoji: "👽",
    hint: "Surreal, cult, midnight-movie energy — the strange, singular, and off-format. Dreamlike and WTF; the weirder the better. Aim for the tier of The Holy Mountain, Mandy, Swiss Army Man, Beyond the Black Rainbow.",
    genreIds: [14, 878, 27],
    keywords: ["surrealism", "cult film", "midnight movie", "bizarre", "avant garde"],
    avoidGenreIds: [10751, 16],
  },
  {
    key: "swoon",
    label: "Swoon",
    emoji: "💘",
    hint: "Romance front and center — chemistry, yearning, grand gestures or aching restraint. The tier of Portrait of a Lady on Fire, Before Sunrise, In the Mood for Love.",
    // Romance only. The Drama(18) pull returned films the requireGenreIds gate
    // then threw away (romance has to be the point), so it only burned the
    // Discover page budget and thinned the batch.
    genreIds: [10749],
    keywords: ["love", "forbidden love", "love triangle"],
    rollGenreIds: [10749],
    avoidGenreIds: [27, 53],
    requireGenreIds: [10749], // romance has to be the point
  },
  {
    key: "journey",
    label: "Take me somewhere",
    emoji: "🗺️",
    hint: "Transporting cinema — adventure, sweeping vistas, far-off countries and eras. An escape hatch. The tier of Lawrence of Arabia, The Motorcycle Diaries, Embrace of the Serpent.",
    genreIds: [12, 14, 36],
    keywords: ["road trip", "survival", "expedition", "epic"],
    avoidGenreIds: [16, 10751, 28, 878, 99],
  },
  {
    key: "true",
    label: "Stranger than fiction",
    emoji: "🎙️",
    hint: "Documentaries and true stories — real people, real events, stranger than anything scripted. The tier of The Act of Killing, Man on Wire, Grizzly Man.",
    genreIds: [99, 36, 18],
    keywords: ["based on true story", "biography", "true crime"],
    rollGenreIds: [99, 36],
    requireGenreIds: [99, 36, 18], // documentary, history, or a true-story drama
  },
];

export const VIBE_KEYS = VIBES.map((v) => v.key) as [string, ...string[]];

export function vibeByKey(key: string | null | undefined): Vibe | null {
  if (!key) return null;
  return VIBES.find((v) => v.key === key) ?? null;
}
