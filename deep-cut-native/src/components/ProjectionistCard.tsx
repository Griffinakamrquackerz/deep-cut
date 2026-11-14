import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "@/lib/theme";

// The Projectionist Card — taste made visibly compounding (web:
// ProjectionistCard). Rank title, a sprocket progress strip to the next tier,
// and the three stats the house respects: films met, deep cuts, off-the-map.
// `accent` lets a themed profile re-tint it (its amber token).

interface RankTier {
  title: string;
  glyph: string;
  at: number;
  line: string;
  side: "below" | "above";
}

export interface TasteStats {
  met: number;
  deepCuts: number;
  avgObscurity: number;
  reels: number;
  rank: RankTier;
  next: RankTier | null;
  progress: number;
}

export default function ProjectionistCard({
  stats,
  isMe = false,
  accent = colors.amber,
}: {
  stats: TasteStats;
  isMe?: boolean;
  accent?: string;
}) {
  const dots = Math.round(stats.avgObscurity);
  const above = stats.rank.side === "above";
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.eyebrow}>Crew credit</Text>
        <Text style={styles.reels}>{stats.reels} reels</Text>
      </View>

      <View style={{ flexDirection: "row", marginTop: 4 }}>
        <Text
          style={[
            styles.lineBadge,
            above
              ? { borderColor: accent, color: accent, backgroundColor: "rgba(255,180,84,0.12)" }
              : { borderColor: colors.line, color: colors.dim, backgroundColor: "rgba(23,18,16,0.6)" },
          ]}
        >
          {above ? "★ Above the line" : "Below the line"}
        </Text>
      </View>

      <Text style={[styles.rankTitle, { color: accent }]}>
        {stats.rank.glyph} {stats.rank.title.toUpperCase()}
      </Text>
      <Text style={styles.rankLine}>“{stats.rank.line}”</Text>

      {stats.next ? (
        <View style={{ marginTop: 12 }}>
          <View style={styles.track}>
            <View
              style={[styles.fill, { width: `${Math.max(4, stats.progress * 100)}%`, backgroundColor: accent }]}
            />
          </View>
          <Text style={styles.nextLine}>
            next: {stats.next.glyph} {stats.next.title} at {stats.next.at} reels
          </Text>
        </View>
      ) : (
        <Text style={styles.topLadder}>★ Top of the ladder — the archive is yours ★</Text>
      )}

      <View style={styles.statRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{stats.met}</Text>
          <Text style={styles.statLabel}>films met</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{stats.deepCuts}</Text>
          <Text style={styles.statLabel}>deep cuts</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: accent, letterSpacing: -1 }]}>
            {"◆".repeat(dots)}
            <Text style={{ color: colors.line }}>{"◆".repeat(Math.max(0, 5 - dots))}</Text>
          </Text>
          <Text style={styles.statLabel}>off the map</Text>
        </View>
      </View>

      {isMe && stats.next && (
        <Text style={styles.tip}>deep cuts count double — crank the obscurity dial 🎚</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 16,
  },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  eyebrow: {
    color: colors.dim,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  reels: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10 },
  lineBadge: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontFamily: fonts.mono,
    fontSize: 8.5,
    letterSpacing: 2,
    textTransform: "uppercase",
    overflow: "hidden",
  },
  rankTitle: { fontFamily: fonts.display, fontSize: 30, lineHeight: 32, marginTop: 4 },
  rankLine: { color: colors.dim, fontFamily: fonts.bodyItalic, fontSize: 11 },
  track: {
    height: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    overflow: "hidden",
  },
  fill: { height: "100%" },
  nextLine: { color: colors.dim, fontFamily: fonts.mono, fontSize: 9.5, marginTop: 4, textAlign: "right" },
  topLadder: {
    color: colors.ticket,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 12,
  },
  statRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  statBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "rgba(23,18,16,0.6)",
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: "center",
  },
  statNum: { color: colors.cream, fontFamily: fonts.display, fontSize: 24, lineHeight: 26 },
  statLabel: {
    color: colors.dim,
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 2,
  },
  tip: { color: colors.dim, fontFamily: fonts.mono, fontSize: 9.5, textAlign: "center", marginTop: 8 },
});
