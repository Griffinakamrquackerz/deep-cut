import { Redirect } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useAuth } from "./_layout";
import { colors, fonts, glowAmber, mono } from "@/lib/theme";
import { supabase } from "@/lib/supabase";

// The front-of-house gate. Cold start lands here once:
//   no session            → /login
//   session, <8 loved     → /onboarding   (same rule as the web app)
//   session, onboarded    → /tonight
export default function Gate() {
  const { session, ready } = useAuth();
  const [lovedCount, setLovedCount] = useState<number | null>(null);

  useEffect(() => {
    if (!ready || !session) return;
    let alive = true;
    supabase
      .from("loved_movies")
      .select("movie_id", { count: "exact", head: true })
      .eq("user_id", session.user.id)
      .then(({ count }) => {
        if (alive) setLovedCount(count ?? 0);
      });
    return () => {
      alive = false;
    };
  }, [ready, session]);

  if (!ready) return <Splash />;
  if (!session) return <Redirect href="/login" />;
  if (lovedCount === null) return <Splash />;
  if (lovedCount < 8) return <Redirect href="/onboarding" />;
  return <Redirect href="/tonight" />;
}

function Splash() {
  return (
    <View style={styles.splash}>
      <Text style={styles.logo}>DEEP CUT</Text>
      <Text style={styles.tag}>movies you haven&apos;t seen yet</Text>
      <ActivityIndicator color={colors.amber} style={{ marginTop: 16 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  logo: { color: colors.amber, fontFamily: fonts.display, fontSize: 52, letterSpacing: 3, ...glowAmber },
  tag: { color: colors.dim, fontFamily: mono, fontSize: 12, marginTop: 6 },
});
