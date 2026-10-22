// API types + constants, transferred 1:1 from the backend
// (../src/lib/schemas.ts, services.ts, vibes.ts). The API validates
// against these exact values — do not edit here without editing there.

export type Service =
  | "netflix"
  | "max"
  | "hulu"
  | "prime"
  | "criterion"
  | "tubi"
  | "disney"
  | "peacock"
  | "paramount"
  | "apple"
  | "mubi"
  | "shudder";

export const SERVICES: Service[] = [
  "netflix",
  "max",
  "hulu",
  "prime",
  "criterion",
  "tubi",
  "disney",
  "peacock",
  "paramount",
  "apple",
  "mubi",
  "shudder",
];

export const SERVICE_LABELS: Record<Service, string> = {
  netflix: "Netflix",
  max: "Max",
  hulu: "Hulu",
  prime: "Prime Video",
  criterion: "Criterion",
  tubi: "Tubi",
  disney: "Disney+",
  peacock: "Peacock",
  paramount: "Paramount+",
  apple: "Apple TV+",
  mubi: "MUBI",
  shudder: "Shudder",
};

export interface Vibe {
  key: string;
  label: string;
  emoji: string;
}

export const VIBES: Vibe[] = [
  { key: "laugh", label: "Make me laugh", emoji: "🤡" },
  { key: "scare", label: "Scare me", emoji: "🔪" },
  { key: "cry", label: "Emotional damage", emoji: "😭" },
  { key: "mind", label: "Melt my brain", emoji: "🌀" },
  { key: "edge", label: "Edge of my seat", emoji: "💥" },
  { key: "cozy", label: "Cozy night in", emoji: "🍿" },
  { key: "weird", label: "Get weird", emoji: "👽" },
  { key: "swoon", label: "Swoon", emoji: "💘" },
  { key: "journey", label: "Take me somewhere", emoji: "🗺️" },
  { key: "true", label: "Stranger than fiction", emoji: "🎙️" },
];

export type Reaction = "loved" | "fine" | "not_for_me" | "loved_ironically";
export type Why = "vibe" | "story" | "performances" | "chaos";

export interface RecMovie {
  id: number;
  title: string;
  year: number | null;
  runtime: number | null;
  poster_path: string | null;
  overview: string | null;
  genres: string[];
  providers: Partial<Record<Service, boolean>>;
  tmdb_rating?: number | null;
  imdb_rating?: number | null;
  rt_rating?: number | null;
}

export interface Rec {
  id: string;
  reason: string;
  obscurity: number;
  /** Acclaim-vs-reach, 1-5 from the server; null when no rating to judge on. */
  gem?: number | null;
  status: "active" | "watchlisted" | "seen" | "dismissed";
  batch: number;
  created_at: string;
  movies: RecMovie | null;
}

export interface StarterFilm {
  id: number;
  title: string;
  year: number;
  poster: string | null;
}

export interface SearchHit {
  id: number;
  title: string;
  year: number | null;
  poster_path?: string | null;
}
