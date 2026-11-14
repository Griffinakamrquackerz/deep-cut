import Constants from "expo-constants";

// Public runtime config, set in app.json → expo.extra. All three values are
// public by design (the Supabase anon key ships in every client; RLS is the
// security boundary). No server secrets ever live in this app.
interface Extra {
  apiBaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Partial<Extra>;

export const CONFIG: Extra = {
  apiBaseUrl: extra.apiBaseUrl ?? "https://thedeepcut.xyz",
  supabaseUrl: extra.supabaseUrl ?? "",
  supabaseAnonKey: extra.supabaseAnonKey ?? "",
};
