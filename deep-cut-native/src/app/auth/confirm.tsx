import { router } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../_layout";
import { colors, fonts, glowAmber } from "@/lib/theme";

// Where a tapped invite email lands once iOS hands thedeepcut.xyz links to
// the app.
//
// This screen has to exist even though it does almost nothing. A Universal
// Link opens the app AT THE LINK'S PATH — /auth/confirm — so without a route
// here expo-router would show its unmatched-route screen to somebody who just
// tapped their own invite. The worst possible first second of the product.
//
// The token exchange itself happens in the root layout's deep-link handler
// (Linking.useURL → createSessionFromUrl), which is also what catches the link
// on a cold start. This just holds the marquee until the session lands.
//
// Same shape as auth-callback.tsx, which serves the deepcut:// scheme. Two
// routes rather than one because the path is dictated by the link: the email
// carries an https URL, and it is the same URL the website uses.
export default function AuthConfirm() {
  const { session, ready } = useAuth();

  useEffect(() => {
    if (!ready) return;
    // A brand-new invite has no loved films yet, so index.tsx will bounce them
    // to onboarding — the same rule the web confirm route applies. Routing to
    // "/" rather than a guess keeps that decision in one place.
    //
    // The 2.5s pause on failure is not a spinner for show: the deep-link
    // handler runs in parallel, and leaving immediately would race it and
    // dump somebody on the login screen a moment before their session lands.
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
  logo: {
    color: colors.amber,
    fontFamily: fonts.display,
    fontSize: 48,
    letterSpacing: 3,
    ...glowAmber,
  },
  line: { color: colors.dim, fontFamily: fonts.mono, fontSize: 12, marginTop: 12 },
});
