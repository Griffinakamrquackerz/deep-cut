import React from "react";
import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";
import { colors, fonts } from "@/lib/theme";

// One compact line of ratings + genres, used on every card a movie appears on
// (recs, feed, mixtapes, roll). Mirrors the web RatingsBadges: IMDb, then
// Rotten Tomatoes, else TMDB as a baseline — followed by up to two genres.

export interface MovieMeta {
  imdb?: number | null;
  rt?: number | null;
  tmdb?: number | null;
  genres?: string[] | null;
}

/** The single best rating as a tiny label for a poster corner badge. */
export function primaryRatingLabel(m: MovieMeta): string | null {
  if (m.imdb != null) return `★ ${m.imdb.toFixed(1)}`;
  if (m.rt != null) return `🍅 ${m.rt}%`;
  if (m.tmdb != null) return `★ ${m.tmdb.toFixed(1)}`;
  return null;
}

export default function RatingLine({
  imdb,
  rt,
  tmdb,
  genres,
  style,
}: MovieMeta & { style?: StyleProp<TextStyle> }) {
  const hasRating = imdb != null || rt != null || tmdb != null;
  const genreText = genres && genres.length ? genres.slice(0, 2).join(" / ") : null;
  if (!hasRating && !genreText) return null;

  return (
    <Text style={[styles.line, style]} numberOfLines={1}>
      {imdb != null && (
        <Text style={styles.imdb}>
          <Text style={styles.imdbLabel}>IMDb</Text> {imdb.toFixed(1)}
        </Text>
      )}
      {rt != null && (
        <Text style={{ color: rt >= 60 ? colors.avail : colors.ticket }}>
          {imdb != null ? "  " : ""}🍅 {rt}%
        </Text>
      )}
      {imdb == null && rt == null && tmdb != null && (
        <Text style={{ color: colors.dim }}>★ {tmdb.toFixed(1)}</Text>
      )}
      {genreText && (
        <Text style={{ color: colors.dim }}>
          {hasRating ? "  ·  " : ""}
          {genreText}
        </Text>
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  line: { fontFamily: fonts.mono, fontSize: 11 },
  imdb: { color: colors.amber },
  imdbLabel: { fontFamily: fonts.monoSemi },
});
