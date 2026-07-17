// MySpace-for-cinephiles: profile themes reskin a member's public card by
// overriding the design-token CSS variables inside a wrapper class (see
// globals.css .pt-*). The keys are stored in users.profile_theme.

export interface ProfileTheme {
  key: string;
  label: string;
  desc: string;
  /** Swatch colors for the picker chip. */
  swatch: [string, string];
}

export const PROFILE_THEMES: ProfileTheme[] = [
  { key: "marquee", label: "Marquee", desc: "house amber & ticket red", swatch: ["#FFB454", "#E4573D"] },
  { key: "noir", label: "Film Noir", desc: "silver nitrate, hard shadows", swatch: ["#E8E4DA", "#8E8E8E"] },
  { key: "giallo", label: "Giallo", desc: "lurid red, black gloves", swatch: ["#FF4438", "#8E1F14"] },
  { key: "technicolor", label: "Technicolor", desc: "teal & magenta, dialed to 11", swatch: ["#3EE8C2", "#E84393"] },
  { key: "vhs", label: "Midnight VHS", desc: "tracking-line purple & cyan", swatch: ["#B78CFF", "#43D9FF"] },
  { key: "golden", label: "Golden Age", desc: "sepia, cigarette smoke", swatch: ["#F5D67B", "#C08A3E"] },
];

export const THEME_KEYS = PROFILE_THEMES.map((t) => t.key) as [string, ...string[]];

export function themeClass(key: string | null | undefined): string {
  const k = key && THEME_KEYS.includes(key) ? key : "marquee";
  return `pt-${k}`;
}
