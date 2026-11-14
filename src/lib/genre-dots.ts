// The coloured dots a video store sorts by.
//
// Every rental shop had its own code — red for horror, yellow for comedy —
// stuck to the spine so a returned tape could be reshelved without reading
// it. These are ours. Brighter than the poster-fallback hues in Poster.tsx
// on purpose: those are backgrounds, these are stickers.

const DOTS: Record<string, string> = {
  Horror: "#d6402b",
  Thriller: "#c9742b",
  Comedy: "#e8c13a",
  Drama: "#5c8fc9",
  "Science Fiction": "#3fb6a8",
  Fantasy: "#9a6fd0",
  Animation: "#6cc070",
  Romance: "#e07a9a",
  Documentary: "#9aa08a",
  Crime: "#7d7fa8",
  Western: "#b88a4a",
  Music: "#d05cc0",
  Mystery: "#6a78c8",
  Adventure: "#d99a3a",
  Action: "#d95a3a",
  Family: "#8fc98a",
  History: "#a89070",
  War: "#8a8a6a",
};

export function genreDot(genre: string): string {
  return DOTS[genre] ?? "#b7a491";
}
