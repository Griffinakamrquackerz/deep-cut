import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { colors, fonts, glowAmber, mono } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { Button, Eyebrow, FilmStrip, MarqueeBulbs } from "@/components/ui";

// The front door. Members sign in with a password or a one-tap magic link that
// deep-links back in (deepcut://auth-callback, handled in _layout).
//
// The house stays invite-only — public signups are off in Supabase, and the
// magic link passes shouldCreateUser:false — but a stranger who found the app
// in the App Store can now ask for an invite here instead of being told to go
// to the website. Asking isn't getting in, so the velvet rope is untouched;
// it just stops the app being a dead end for everyone who arrives without one.
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Waitlist
  const [asking, setAsking] = useState(false);
  const [askEmail, setAskEmail] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [place, setPlace] = useState<number | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(false);
    if (error) {
      setError(
        /invalid/i.test(error.message)
          ? "Wrong email or password. If you joined by invite link, set a password on thedeepcut.xyz → Settings first."
          : error.message,
      );
      return;
    }
    router.replace("/");
  }

  async function sendMagicLink() {
    if (!email.trim()) {
      setError("Enter your email first, then tap the link button.");
      return;
    }
    setLinkBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: Linking.createURL("auth-callback"),
        shouldCreateUser: false, // invite-only — no new accounts from here
      },
    });
    setLinkBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  async function askForInvite() {
    const value = askEmail.trim().toLowerCase();
    if (!value) return;
    setAskBusy(true);
    setAskError(null);
    // Same public endpoint the website's velvet rope posts to. `hp` is its
    // honeypot — a real person never fills it, so we always send it empty.
    const res = await api<{ ok?: boolean; position?: number }>("/api/waitlist", {
      method: "POST",
      body: JSON.stringify({ email: value, hp: "" }),
    });
    setAskBusy(false);
    if (!res.ok || !res.data?.ok) {
      setAskError(
        res.status === 400
          ? "That email doesn't look right — check it and try again."
          : "Couldn't reach the door. Try again in a minute.",
      );
      return;
    }
    setPlace(res.data.position ?? 0);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: "center", marginBottom: 28 }}>
            <MarqueeBulbs />
            <Eyebrow style={{ marginTop: 10 }}>Admit one</Eyebrow>
            <Text style={styles.logo}>DEEP CUT</Text>
            <Text style={styles.tag}>movies you haven&apos;t seen yet</Text>
            <View style={{ width: 170, marginTop: 12 }}>
              <FilmStrip holes={10} />
            </View>
          </View>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@email.com"
            placeholderTextColor={colors.dim}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            style={styles.input}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="password"
            placeholderTextColor={colors.dim}
            secureTextEntry
            autoComplete="current-password"
            style={styles.input}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          {sent ? (
            <Text style={styles.sent}>
              ✉ Check your email — we sent a one-tap sign-in link. Open it on this phone.
            </Text>
          ) : null}
          <Button title="🎟 Take your seat" onPress={signIn} busy={busy} disabled={!email || !password} />
          <Button
            title="✉ Email me a sign-in link"
            kind="outline"
            onPress={sendMagicLink}
            busy={linkBusy}
            disabled={!email}
          />

          {/* ── The velvet rope ──────────────────────────────── */}
          <View style={styles.rope}>
            {place !== null ? (
              <>
                <Text style={styles.ropeWin}>🎟 You&apos;re in line.</Text>
                <Text style={styles.ropeNote}>
                  {place > 0 ? `Number ${place} at the door. ` : ""}
                  We let people in a few at a time — watch your email.
                </Text>
              </>
            ) : asking ? (
              <>
                <Eyebrow>Ask for an invite</Eyebrow>
                <TextInput
                  value={askEmail}
                  onChangeText={setAskEmail}
                  placeholder="you@email.com"
                  placeholderTextColor={colors.dim}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  style={[styles.input, { marginTop: 10 }]}
                />
                {askError && <Text style={styles.error}>{askError}</Text>}
                <View style={{ marginTop: 10 }}>
                  <Button
                    title="Join the list"
                    kind="outline"
                    onPress={() => void askForInvite()}
                    busy={askBusy}
                    disabled={!askEmail}
                  />
                </View>
                <Pressable onPress={() => setAsking(false)} hitSlop={8}>
                  <Text style={styles.ropeLink}>Never mind</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.ropeNote}>
                  Invite-only. Got one? Use the email you were invited under.
                </Text>
                <Pressable onPress={() => setAsking(true)} hitSlop={8}>
                  <Text style={styles.ropeLink}>No invite? Ask for one →</Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 12 },
  logo: { color: colors.amber, fontFamily: fonts.display, fontSize: 60, letterSpacing: 3, marginTop: 6, ...glowAmber },
  tag: { color: colors.dim, fontFamily: mono, fontSize: 12, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    backgroundColor: colors.surface,
    color: colors.cream,
    padding: 14,
  },
  error: { color: colors.ticket, fontFamily: mono, fontSize: 12, lineHeight: 18 },
  sent: { color: colors.avail, fontFamily: mono, fontSize: 12, lineHeight: 18 },
  rope: {
    marginTop: 14,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    borderStyle: "dashed",
    alignItems: "center",
    gap: 6,
  },
  ropeNote: {
    color: colors.dim,
    fontFamily: mono,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
  },
  ropeLink: {
    color: colors.amber,
    fontFamily: mono,
    fontSize: 12,
    letterSpacing: 0.5,
    marginTop: 6,
  },
  ropeWin: { color: colors.avail, fontFamily: fonts.display, fontSize: 22, letterSpacing: 1 },
});
