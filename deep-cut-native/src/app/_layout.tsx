import { BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_600SemiBold,
} from "@expo-google-fonts/ibm-plex-mono";
import {
  Karla_400Regular,
  Karla_400Regular_Italic,
  Karla_700Bold,
} from "@expo-google-fonts/karla";
import type { Session } from "@supabase/supabase-js";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { createContext, useContext, useEffect, useState } from "react";
import { colors } from "@/lib/theme";
import { createSessionFromUrl } from "@/lib/authLink";
import { useNotificationRouting } from "@/lib/push-routing";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import FilmAtmosphere from "@/components/FilmAtmosphere";

// Root layout: loads the house typefaces (nothing renders in a system font),
// owns the Supabase session, and hands both to every screen. `ready`
// distinguishes "still restoring from AsyncStorage" from "signed out" so the
// gate never flickers to login on cold start.
void SplashScreen.preventAutoHideAsync();

interface AuthState {
  session: Session | null;
  ready: boolean;
  /**
   * Balcony Seats. Read once per session from /api/me and shared, so every
   * screen that needs to know whether to draw an ad doesn't ask separately.
   *
   * Defaults to true while unknown: a member must never catch a flash of
   * advertising on a slow network. A free user seeing one fewer ad for a
   * second is the cheaper mistake in the other direction.
   */
  premium: boolean;
}

const AuthContext = createContext<AuthState>({
  session: null,
  ready: false,
  premium: true,
});
export const useAuth = () => useContext(AuthContext);

export default function RootLayout() {
  const [state, setState] = useState<AuthState>({ session: null, ready: false, premium: true });
  const [fontsLoaded] = useFonts({
    BebasNeue_400Regular,
    IBMPlexMono_400Regular,
    IBMPlexMono_600SemiBold,
    Karla_400Regular,
    Karla_400Regular_Italic,
    Karla_700Bold,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState((s) => ({ ...s, session, ready: true }));
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setState((s) => ({ ...s, session, ready: true }));
    });
    return () => subscription.unsubscribe();
  }, []);

  // Membership, once the session exists. Signed out means no membership, and
  // an unreachable API leaves the optimistic default alone rather than
  // downgrading somebody's paid account because their train went into a tunnel.
  useEffect(() => {
    if (!state.session) {
      setState((s) => (s.premium ? { ...s, premium: false } : s));
      return;
    }
    let alive = true;
    void api<{ premium: boolean }>("/api/me").then((r) => {
      if (alive && r.ok && r.data) {
        setState((s) => ({ ...s, premium: r.data!.premium === true }));
      }
    });
    return () => {
      alive = false;
    };
  }, [state.session]);

  // Magic-link deep links (deepcut://auth-callback…) → a session. Catches both
  // a cold start from the link and a link tapped while the app is open.
  const incomingUrl = Linking.useURL();
  useEffect(() => {
    if (incomingUrl) void createSessionFromUrl(incomingUrl).catch(() => {});
  }, [incomingUrl]);

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  // A tapped notification goes to the thing it announced. Held until the fonts
  // are in, because that's when the Stack below mounts and routes exist to
  // navigate to.
  useNotificationRouting(fontsLoaded);

  if (!fontsLoaded) return null; // splash stays up until the marquee can be lit

  return (
    <AuthContext.Provider value={state}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
      {/* A hairline burn across the screen — the only celluloid left. */}
      <FilmAtmosphere />
    </AuthContext.Provider>
  );
}
