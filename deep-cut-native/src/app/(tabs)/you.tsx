import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../_layout";
import ProfileScreen from "@/components/ProfileScreen";
import YouBooth from "@/components/YouBooth";
import { colors, fonts } from "@/lib/theme";

// The You tab IS the member card — the exact same ProfileScreen everyone else
// sees at /u/[key], rendered for your own id (isMe: edit link, no follow).
export default function You() {
  const { session } = useAuth();
  if (!session) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <Text style={styles.dim}>Taking your seat…</Text>
        </View>
      </SafeAreaView>
    );
  }
  return <ProfileScreen profileKey={session.user.id} footer={<YouBooth />} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  dim: { color: colors.dim, fontFamily: fonts.mono, fontSize: 12 },
});
