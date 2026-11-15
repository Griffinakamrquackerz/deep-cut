import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "@/lib/theme";
import { SERVICE_LABELS, type Rec, type Service } from "@/lib/types";
import RatingLine from "./RatingLine";
import { gemLabel } from "@/lib/gem";
import { ShelfTalker } from "./house";
import { CaseSticker, GenreDots, ShelfLip, StampButton, VhsCase } from "./rooms";
import { ObscurityDots, Poster } from "./ui";

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
    // A rental case on the shelf: the one-sheet in a clamshell, genre on the
    // coloured dots a video store sorts by, the clerk's card taped underneath,
    // the three things you can do with it as stamps, and the wooden lip of the
    // shelf it's standing on.
    <View style={styles.card}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Pressable onPress={() => router.push(`/m/${m.id}`)}>
          <VhsCase>
            <Poster path={m.poster_path} title={m.title} year={m.year} width={92} />
          </VhsCase>
          {/* Earned on acclaim-vs-reach, never on low vote count alone. */}
          {gemLabel(rec.gem ?? null) && <CaseSticker>{gemLabel(rec.gem ?? null)!}</CaseSticker>}
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
            style={{ marginTop: 4 }}
          />
          <GenreDots genres={m.genres} />
          {/* The reason, as the card a video-store clerk tapes under a tape
              they need you to rent. Three lines at most — this card repeats a
              dozen times down the feed, so prose compounds into a wall. */}
          <ShelfTalker>{rec.reason}</ShelfTalker>
          {services.length > 0 && (
            <Text style={[styles.services, { marginTop: 10 }]} numberOfLines={1}>
              ▸ {services.map((s) => SERVICE_LABELS[s]).join(" · ")}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.actions}>
        <StampButton title="+ Watchlist" tone="amber" tilt={-1.2} flex={1.25} onPress={onWatchlist} />
        <StampButton title="Seen it" tilt={0.8} onPress={onSeen} />
        <StampButton title="Not for me" tone="dim" tilt={-0.6} flex={0.95} onPress={onDismiss} />
      </View>
      <ShelfLip />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1d1613",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(243,233,215,0.06)",
    borderBottomWidth: 0,
    padding: 12,
    paddingBottom: 0,
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
  actions: { flexDirection: "row", gap: 8, paddingBottom: 12 },
});
