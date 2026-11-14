import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, mono } from "@/lib/theme";

// The tab bar, for screens that aren't tabs.
//
// Detail screens (a film, a person, a mixtape, someone's profile) live in the
// root stack, not the (tabs) group, so they render without the bar — tap into a
// mixtape and the whole house disappears. This puts the five doors back.
//
// Navigation uses replace, not push: these screens are already stacked on top
// of the tabs, and pushing a tab from here would grow the stack every time
// someone bounced between rooms.

const DOORS = [
  { href: "/mixtapes", glyph: "✉️", label: "MIXTAPES" },
  { href: "/community", glyph: "🍿", label: "COMMUNITY" },
  { href: "/tonight", glyph: null, label: "TONIGHT" }, // the centre clapper
  { href: "/you", glyph: "🎟", label: "YOU" },
  { href: "/settings", glyph: "🎛", label: "SETTINGS" },
] as const;

export default function HouseNav() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {DOORS.map((d) => (
        <Pressable
          key={d.href}
          style={styles.door}
          onPress={() => router.replace(d.href)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={d.label}
        >
          {d.glyph ? (
            <>
              <Text style={styles.glyph}>{d.glyph}</Text>
              <Text style={styles.label}>{d.label}</Text>
            </>
          ) : (
            // Matches the raised clapper in the real tab bar, minus its
            // animation — nothing here is ever the active tab.
            <View style={styles.clapper}>
              <Text style={styles.clapperGlyph}>🎬</Text>
              <Text style={styles.clapperLabel}>TONIGHT</Text>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-around",
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingTop: 6,
  },
  door: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 4 },
  glyph: { fontSize: 20, opacity: 0.5 },
  label: {
    color: colors.dim,
    fontFamily: mono,
    fontSize: 9.5,
    letterSpacing: 1,
    marginTop: 3,
  },
  clapper: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.ticket,
    borderColor: colors.amber,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    marginTop: -14, // rides above the bar like the real one
  },
  clapperGlyph: { fontSize: 18 },
  clapperLabel: {
    color: colors.cream,
    fontFamily: fonts.mono,
    fontSize: 7,
    letterSpacing: 1,
    marginTop: 1,
  },
});
