import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { colors, mono } from "@/lib/theme";

// An explicit way out. The detail screens had none — swiping from the edge was
// the only exit, which isn't reachable for everyone and doesn't exist at all
// with certain accessibility or keyboard setups.
//
// Falls back to Tonight when there's nothing to go back to, so it can never
// strand someone who arrived by deep link (a shared /m/… or /u/… URL opens with
// an empty history).
export default function BackButton({
  label = "Back",
  style,
}: {
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/tonight"))}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.btn, pressed && { opacity: 0.6 }, style]}
    >
      <Text style={styles.text}>‹ {label.toUpperCase()}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  text: { color: colors.dim, fontFamily: mono, fontSize: 11, letterSpacing: 1.5 },
});
