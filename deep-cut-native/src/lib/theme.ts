// Camp design tokens — transferred 1:1 from the web app's globals.css @theme
// (../src/app/globals.css). Do not invent new colors; extend there first.
export const colors = {
  bg: "#171210",
  surface: "#231b17",
  line: "#3b2e27",
  cream: "#f3e9d7",
  dim: "#b7a491",
  amber: "#ffb454",
  ticket: "#e4573d",
  avail: "#8fbf7f",
} as const;

// The web app's exact typefaces (--font-bebas / --font-plex-mono / --font-karla),
// loaded in src/app/_layout.tsx before anything renders.
export const fonts = {
  display: "BebasNeue_400Regular",
  mono: "IBMPlexMono_400Regular",
  monoSemi: "IBMPlexMono_600SemiBold",
  body: "Karla_400Regular",
  bodyBold: "Karla_700Bold",
  bodyItalic: "Karla_400Regular_Italic",
} as const;

/** Back-compat alias — every style that says `fontFamily: mono` gets Plex. */
export const mono = fonts.mono;

/** The amber marquee glow (web: .glow-amber). */
export const glowAmber = {
  textShadowColor: "rgba(255, 180, 84, 0.55)",
  textShadowOffset: { width: 0, height: 0 },
  textShadowRadius: 14,
} as const;

/** TMDB poster URL helper (same CDN + sizes the web app uses). */
export function posterUrl(path: string | null | undefined, size: "w185" | "w342" | "w500" = "w342") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

// MySpace-but-cinema profile themes — each reskins a member card by overriding
// three accent tokens (amber/ticket/avail), exactly like the web's .pt-* classes
// in globals.css. Everything else (bg/surface/line/cream/dim) stays constant.
export type ProfilePalette = { amber: string; ticket: string; avail: string };

const PROFILE_PALETTES: Record<string, ProfilePalette> = {
  marquee: { amber: "#ffb454", ticket: "#e4573d", avail: "#8fbf7f" },
  noir: { amber: "#e8e4da", ticket: "#b8b8b8", avail: "#d6d6d6" },
  giallo: { amber: "#ff4438", ticket: "#ff6f5e", avail: "#ffb3a7" },
  technicolor: { amber: "#3ee8c2", ticket: "#e84393", avail: "#7ef0d4" },
  vhs: { amber: "#b78cff", ticket: "#43d9ff", avail: "#8be9fd" },
  golden: { amber: "#f5d67b", ticket: "#c08a3e", avail: "#e8ce96" },
};

/** Resolve a profile theme key to its accent palette (falls back to marquee). */
export function profilePalette(key: string | null | undefined): ProfilePalette {
  return PROFILE_PALETTES[key ?? "marquee"] ?? PROFILE_PALETTES.marquee;
}

// Theme picker metadata — matches web lib/themes.ts PROFILE_THEMES 1:1.
export interface ProfileThemeMeta {
  key: string;
  label: string;
  desc: string;
  swatch: [string, string];
}

export const PROFILE_THEMES: ProfileThemeMeta[] = [
  { key: "marquee", label: "Marquee", desc: "house amber & ticket red", swatch: ["#FFB454", "#E4573D"] },
  { key: "noir", label: "Film Noir", desc: "silver nitrate, hard shadows", swatch: ["#E8E4DA", "#8E8E8E"] },
  { key: "giallo", label: "Giallo", desc: "lurid red, black gloves", swatch: ["#FF4438", "#8E1F14"] },
  { key: "technicolor", label: "Technicolor", desc: "teal & magenta, dialed to 11", swatch: ["#3EE8C2", "#E84393"] },
  { key: "vhs", label: "Midnight VHS", desc: "tracking-line purple & cyan", swatch: ["#B78CFF", "#43D9FF"] },
  { key: "golden", label: "Golden Age", desc: "sepia, cigarette smoke", swatch: ["#F5D67B", "#C08A3E"] },
];
