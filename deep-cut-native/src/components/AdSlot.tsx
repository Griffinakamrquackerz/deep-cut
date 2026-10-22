import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/app/_layout";
import { colors, fonts, glowAmber } from "@/lib/theme";

// The ad slot — native port of ../src/components/AdSlot.tsx.
//
// Right now every one of these draws a "house ad": a themed card pointing at
// one of the app's own loops. That is deliberate rather than a placeholder.
// The placements, the spacing and the membership check are the part that has to
// be right, and they can all be got right — and looked at on a real phone —
// before an ad network is involved. When AdMob exists, this component is the
// only file that changes.
//
// It cannot show an ad to a member. That check lives HERE rather than at each
// call site because the web app learned it the hard way: three of four
// placements remembered and the fourth didn't, so people who had paid to
// remove advertising saw it on the one screen built for leaning back.

// Kept word-for-word identical to the web house ads. Plain sentences on
// purpose — see the note in ../src/components/AdSlot.tsx.
const HOUSE_ADS = [
  {
    eyebrow: "Intermission",
    title: "MAKE SOMEONE A MIXTAPE",
    line: "Put a few films in a list and send it to a friend.",
    href: "/(tabs)/mixtapes",
    cta: "Make one",
  },
  {
    eyebrow: "Intermission",
    title: "YOUR TASTE CARD",
    line: "See what everything you've rated adds up to.",
    href: "/(tabs)/you",
    cta: "See yours",
  },
  {
    eyebrow: "Intermission",
    title: "GO DEEPER",
    line: "Turn the obscurity dial up. There's a lot further down to go.",
    href: "/(tabs)/tonight",
    cta: "Deal me more",
  },
] as const;

export default function AdSlot({
  index = 0,
  style,
}: {
  /** Stable index so different placements rotate different house ads. */
  index?: number;
  style?: object;
}) {
  const { premium } = useAuth();
  if (premium) return null;

  const ad = HOUSE_ADS[index % HOUSE_ADS.length];

  return (
    <View style={[styles.card, style]}>
      <Text style={styles.eyebrow}>{ad.eyebrow.toUpperCase()}</Text>
      <Text style={[styles.title, glowAmber]}>{ad.title}</Text>
      <Text style={styles.line}>{ad.line}</Text>
      <Pressable style={styles.cta} onPress={() => router.push(ad.href as never)}>
        <Text style={styles.ctaText}>{ad.cta} →</Text>
      </Pressable>
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
    alignItems: "center",
  },
  eyebrow: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.6, color: colors.dim },
  title: {
    marginTop: 4,
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.amber,
    textAlign: "center",
  },
  line: {
    marginTop: 4,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.dim,
    textAlign: "center",
  },
  cta: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.amber,
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  ctaText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.amber,
  },
});
