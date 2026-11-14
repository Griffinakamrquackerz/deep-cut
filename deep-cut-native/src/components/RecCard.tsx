import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "@/lib/theme";
import { SERVICE_LABELS, type Rec, type Service } from "@/lib/types";
import RatingLine from "./RatingLine";
import { gemLabel } from "@/lib/gem";
import { Button, ObscurityDots, Poster } from "./ui";

// One dealt film — poster, the dealer's reason, obscurity, availability, and
// the three actions (watchlist / seen / not for me). Mirrors the web rec card.
export default function RecCard({
  rec,
  onWatchlist,
  onSeen,
  onDismiss,
}: {
  rec: Rec;
  onWatchlist: () => void;
  onSeen: () => void;
  onDismiss: () => void;
}) {
  const m = rec.movies;
  if (!m) return null;
  const services = (Object.keys(m.providers ?? {}) as Service[]).filter(
    (s) => m.providers?.[s] && SERVICE_LABELS[s],
  );

  return (
    <View style={styles.card}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Pressable onPress={() => router.push(`/m/${m.id}`)}>
          <Poster path={m.poster_path} title={m.title} year={m.year} width={96} />
          {/* Earned on acclaim-vs-reach, never on low vote count alone. */}
          {gemLabel(rec.gem ?? null) && (
            <View style={styles.stamp}>
              <Text style={styles.stampText}>{gemLabel(rec.gem ?? null)!.toUpperCase()}</Text>
            </View>
          )}
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} onPress={() => router.push(`/m/${m.id}`)}>
            {m.title} <Text style={styles.year}>{m.year ?? ""}</Text>
          </Text>
          <View style={{ marginTop: 4 }}>
            <ObscurityDots score={rec.obscurity} />
          </View>
          <RatingLine
            imdb={m.imdb_rating}
            rt={m.rt_rating}
            tmdb={m.tmdb_rating}
            genres={m.genres}
            style={{ marginTop: 4 }}
          />
          {/* Two lines, not four — this card repeats a dozen times down the
              feed, so every extra line of prose compounds into a wall. */}
          <Text style={styles.reason} numberOfLines={2}>
            “{rec.reason}”
          </Text>
          {services.length > 0 && (
            <Text style={styles.services} numberOfLines={1}>
              ▸ {services.map((s) => SERVICE_LABELS[s]).join(" · ")}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.actions}>
        <View style={{ flex: 1.2 }}>
          <Button title="＋ Watchlist" kind="outline" size="sm" onPress={onWatchlist} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="✓ Seen it" kind="outline" size="sm" onPress={onSeen} />
        </View>
        <View style={{ flex: 0.8 }}>
          <Button title="✕ Pass" kind="ghost" size="sm" onPress={onDismiss} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  title: { color: colors.cream, fontFamily: fonts.display, fontSize: 24, letterSpacing: 0.5 },
  year: { color: colors.dim, fontFamily: fonts.mono, fontSize: 12 },
  reason: {
    color: colors.cream,
    fontFamily: fonts.bodyItalic,
    fontSize: 14,
    marginTop: 6,
    lineHeight: 20,
  },
  services: { color: colors.avail, fontFamily: fonts.mono, fontSize: 11, marginTop: 6 },
  actions: { flexDirection: "row", gap: 8 },
  stamp: {
    position: "absolute",
    top: 8,
    left: -6,
    backgroundColor: "rgba(23,18,16,0.92)",
    borderColor: colors.amber,
    borderWidth: 1,
    borderRadius: 3,
    paddingVertical: 3,
    paddingHorizontal: 5,
    transform: [{ rotate: "-8deg" }],
  },
  stampText: { color: colors.amber, fontFamily: fonts.mono, fontSize: 8, letterSpacing: 1 },
});
