import { router } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "./_layout";
import { colors, fonts, glowAmber } from "@/lib/theme";

// Where magic-link taps land. The token exchange happens in the root layout's
// deep-link handler; this screen just holds the marquee until the session lands,
// then walks you into the theater (or back to the box office if it didn't take).
export default function AuthCallback() {
  const { session, ready } = useAuth();

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => router.replace(session ? "/" : "/login"), session ? 0 : 2500);
    return () => clearTimeout(t);
  }, [ready, session]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>
        <Text style={styles.logo}>DEEP CUT</Text>
        <ActivityIndicator color={colors.amber} style={{ marginTop: 18 }} />
        <Text style={styles.line}>Taking your seat…</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  logo: { color: colors.amber, fontFamily: fonts.display, fontSize: 48, letterSpacing: 3, ...glowAmber },
  line: { color: colors.dim, fontFamily: fonts.mono, fontSize: 12, marginTop: 12 },
});
