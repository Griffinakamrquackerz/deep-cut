import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import { CONFIG } from "./config";

// Native Supabase client: sessions persist in AsyncStorage; token auto-refresh
// runs only while the app is foregrounded (the official RN pattern).
//
// Web/SSR guard: `expo export` statically renders routes in Node, where
// neither window nor AsyncStorage exists — so storage/persistence is wired up
// only on real devices (and browser web falls back to supabase-js defaults).
const isNative = Platform.OS !== "web";
const isServer = Platform.OS === "web" && typeof window === "undefined";

export const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
  auth: {
    ...(isNative ? { storage: AsyncStorage } : {}),
    autoRefreshToken: !isServer,
    persistSession: !isServer,
    detectSessionInUrl: false,
  },
});

if (isNative) {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
