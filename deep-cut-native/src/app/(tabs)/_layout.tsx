import { Redirect, Tabs, usePathname } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useAuth } from "../_layout";
import UsherTour from "@/components/UsherTour";
import { api } from "@/lib/api";
import { registerForPush } from "@/lib/push";
import { colors, fonts, mono } from "@/lib/theme";

// The house's tab bar — same five doors as the web, with the big round
// TONIGHT clapper in the center.
function Icon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{glyph}</Text>;
}

/** The center clapper — a raised ticket-red reel. When you're on Tonight the
 *  dashed sprocket ring spins (web: .reel-spin) and a beacon halo pulses out
 *  behind it (the "now showing" flash). Reduced motion holds it lit and still. */
function TonightBadge({ focused }: { focused: boolean }) {
  const reduced = useReducedMotion();
  const live = focused && !reduced;
  const spin = useSharedValue(0);
  const ping = useSharedValue(0);

  useEffect(() => {
    if (!live) {
      spin.value = 0;
      ping.value = 0;
      return;
    }
    // Sprocket ring spins like a running reel — 7s per turn, matching web.
    spin.value = withRepeat(withTiming(1, { duration: 7000, easing: Easing.linear }), -1);
    // Beacon: a ring flares out and fades, then repeats — the marquee flash.
    ping.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 0 }),
      ),
      -1,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.7 * (1 - ping.value),
    transform: [{ scale: 1 + ping.value * 0.6 }],
  }));

  return (
    <View style={styles.clapperWrap}>
      {live && <Animated.View pointerEvents="none" style={[styles.halo, haloStyle]} />}
      <View style={[styles.clapper, focused && styles.clapperOn]}>
        <Animated.View
          pointerEvents="none"
          style={[styles.reelRing, focused && { borderColor: "rgba(243,233,215,0.6)" }, ringStyle]}
        />
        <Text style={{ fontSize: 20, lineHeight: 24 }}>🎬</Text>
        <Text style={styles.clapperLabel}>TONIGHT</Text>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { session, ready } = useAuth();
  const pathname = usePathname();

  // Someone tagging you or sending you a film is worth knowing about from
  // wherever you are — before this the count only existed on a chip INSIDE
  // Community, so the only way to find out something was waiting was to go
  // looking in the room you'd only enter if you already knew.
  //
  // Re-read on navigation: it's a cheap count, and it's how the badge clears
  // after a trip to the inbox.
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!session) return;
    let alive = true;
    void api<{ unread: number }>("/api/notifications").then((r) => {
      if (alive) setUnread(Number(r.data?.unread ?? 0));
    });
    return () => {
      alive = false;
    };
  }, [session, pathname]);

  // Keep an already-opted-in device's push token fresh (silent — never prompts
  // someone who hasn't turned reminders on in Settings).
  useEffect(() => {
    if (session) void registerForPush(false);
  }, [session]);

  if (ready && !session) return <Redirect href="/login" />;

  return (
    // The studio tour lives here, not on Tonight: it walks you into Mixtapes,
    // Community, You and Settings, and a component mounted inside Tonight would
    // unmount the moment it did.
    <View style={{ flex: 1 }}>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          height: 84,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.amber,
        tabBarInactiveTintColor: colors.dim,
        tabBarLabelStyle: { fontFamily: mono, fontSize: 9.5, letterSpacing: 1 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="mixtapes"
        options={{
          title: "MIXTAPES",
          tabBarIcon: ({ focused }) => <Icon glyph="✉️" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: "COMMUNITY",
          tabBarIcon: ({ focused }) => <Icon glyph="🍿" focused={focused} />,
          tabBarBadge: unread > 0 ? (unread > 9 ? "9+" : unread) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.ticket,
            color: colors.cream,
            fontFamily: mono,
            fontSize: 9,
          },
        }}
      />
      <Tabs.Screen
        name="tonight"
        options={{
          title: "",
          tabBarLabel: () => null,
          tabBarItemStyle: { overflow: "visible" },
          tabBarIcon: ({ focused }) => <TonightBadge focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          title: "YOU",
          tabBarIcon: ({ focused }) => <Icon glyph="🎟" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "SETTINGS",
          tabBarIcon: ({ focused }) => <Icon glyph="🎛" focused={focused} />,
        }}
      />
    </Tabs>
      <UsherTour />
    </View>
  );
}

const styles = StyleSheet.create({
  clapperWrap: {
    width: 84,
    height: 84,
    marginTop: -26,
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    borderColor: colors.ticket,
  },
  clapper: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.ticket,
    borderWidth: 2,
    borderColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  clapperOn: {
    shadowColor: colors.ticket,
    shadowOpacity: 0.7,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  // Inner dashed sprocket ring — spins while Tonight is the running reel.
  reelRing: {
    position: "absolute",
    top: 5,
    left: 5,
    right: 5,
    bottom: 5,
    borderRadius: 29,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(243,233,215,0.35)",
  },
  clapperLabel: {
    color: colors.cream,
    fontFamily: fonts.monoSemi,
    fontSize: 8,
    letterSpacing: 1.5,
    marginTop: 1,
  },
});
