import { Image } from "expo-image";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../_layout";
import { api } from "@/lib/api";
import { CONFIG } from "@/lib/config";
import { pushPermissionGranted, registerForPush, unregisterForPush } from "@/lib/push";
import { supabase } from "@/lib/supabase";
import { colors, fonts, mono, PROFILE_THEMES } from "@/lib/theme";
import { SERVICES, SERVICE_LABELS, type SearchHit, type Service } from "@/lib/types";
import { Button, Chip, Eyebrow, Marquee, MarqueeBulbs, Poster } from "@/components/ui";
import { resetStudioTour } from "@/components/UsherTour";

// The projection booth — the native port of the web SettingsScreen. Style your
// card (photo, theme, signature film), set your handle, streaming services,
// Friday reminders, a password, and — App Store 5.1.1 — delete your account.
//
// Deliberately says NOTHING about Balcony Seats. Membership unlocks in-app
// features, so selling or even linking to it from here is digital content
// bought outside Apple, and the reader-app exemption doesn't cover it (that's
// for consuming content purchased elsewhere, not a subscription that changes
// what the app does). It's sold on the website to people who find it there;
// anyone who already has it keeps every benefit, silently. Adding in-app
// purchase is real work and shouldn't hold up a first release.

interface SignatureMovie {
  id: number;
  title: string;
  year: number | null;
}

export default function Settings() {
  const { session } = useAuth();
  const router = useRouter();

  const [handle, setHandle] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [activeTheme, setActiveTheme] = useState("marquee");
  const [signature, setSignature] = useState<SignatureMovie | null>(null);
  const [sigQuery, setSigQuery] = useState("");
  const [sigResults, setSigResults] = useState<SignatureMovie[]>([]);
  const [selected, setSelected] = useState<Set<Service>>(new Set());

  // Region. The list, the per-region service availability and the geo guess all
  // come from /api/region — the server holds the header and the table, and a
  // copy compiled into the binary couldn't be corrected without a release.
  const [region, setRegion] = useState("US");
  const [regions, setRegions] = useState<Array<{ code: string; label: string }>>([]);
  const [availableHere, setAvailableHere] = useState<Service[]>([]);
  const [regionOpen, setRegionOpen] = useState(false);
  const [regionNote, setRegionNote] = useState<string | null>(null);

  const regionLabel = regions.find((r) => r.code === region)?.label ?? region;

  useEffect(() => {
    let alive = true;
    void api<{
      region?: string;
      regionKnown?: boolean;
      regions?: Array<{ code: string; label: string }>;
      services?: Service[];
    }>("/api/region").then((res) => {
      if (!alive || !res.data?.region) return;
      setRegion(res.data.region);
      setRegions(res.data.regions ?? []);
      setAvailableHere(res.data.services ?? []);
      if (res.data.regionKnown === false) {
        setRegionNote(
          `We've guessed ${res.data.region} from your connection — change it if that's wrong.`,
        );
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  async function saveRegion(next: string) {
    const previous = region;
    setRegion(next);
    setRegionOpen(false);
    setRegionNote("Saving…");
    const res = await api<{ services?: Service[] }>("/api/region", {
      method: "PUT",
      body: JSON.stringify({ region: next }),
    });
    if (!res.ok) {
      // Put it back rather than showing a value the server doesn't hold.
      setRegion(previous);
      setRegionNote("Couldn't save that — your region is unchanged.");
      return;
    }
    setAvailableHere(res.data?.services ?? []);
    setRegionNote("Saved. Your next deal uses this catalogue.");
  }
  const [uploading, setUploading] = useState(false);
  const [styleMsg, setStyleMsg] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [pwStatus, setPwStatus] = useState<string | null>(null);
  // How many people are waiting at the door, or null when this account isn't an
  // owner. Admin status is never decided here — the endpoint 403s anyone whose
  // email isn't in ADMIN_EMAILS, so a failed call simply hides the row and the
  // server stays the only source of truth.
  const [doorCount, setDoorCount] = useState<number | null>(null);
  const [notify, setNotify] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);
  const sigTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const [{ data: svc }, profile, granted] = await Promise.all([
      supabase.from("user_services").select("service").eq("user_id", session.user.id),
      api<{
        person: { handle: string | null; avatar_url: string | null };
        theme: string;
        signature: { id: number; title: string; year: number | null } | null;
      }>(`/api/profile/${session.user.id}`),
      pushPermissionGranted(),
    ]);
    setSelected(new Set((svc ?? []).map((r) => r.service as Service)));
    if (profile.ok && profile.data) {
      setHandle(profile.data.person.handle ?? "");
      setAvatar(profile.data.person.avatar_url ?? null);
      setActiveTheme(profile.data.theme ?? "marquee");
      setSignature(profile.data.signature ?? null);
    }
    setNotify(granted);
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  // Ask the door how long the line is. A 403 means this isn't an owner account,
  // which is the same answer as "no door to show" — hence one call, no flag.
  useEffect(() => {
    if (!session) return;
    let live = true;
    void api<{ pending?: unknown[] }>("/api/admin/waitlist").then((res) => {
      if (live && res.ok) setDoorCount(res.data?.pending?.length ?? 0);
    });
    return () => {
      live = false;
    };
  }, [session]);

  async function saveStyle(patch: { theme?: string; signatureMovieId?: number | null }) {
    setStyleMsg(null);
    const res = await api("/api/me", { method: "PATCH", body: JSON.stringify(patch) });
    if (!res.ok) setStyleMsg("Couldn't save that — try again.");
  }

  async function pickAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setStyleMsg("Allow photo access in Settings to add a headshot.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    setStyleMsg(null);
    try {
      // Resize + force JPEG so it matches the avatar endpoint (384px square).
      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 384, height: 384 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      const dataUrl = `data:image/jpeg;base64,${manipulated.base64}`;
      const res = await api<{ url: string }>("/api/avatar", {
        method: "POST",
        body: JSON.stringify({ dataUrl }),
      });
      if (res.ok && res.data?.url) setAvatar(res.data.url);
      else setStyleMsg("Photo upload jammed — try a different image.");
    } catch {
      setStyleMsg("Couldn't read that image — try another.");
    }
    setUploading(false);
  }

  function searchSignature(q: string) {
    setSigQuery(q);
    if (sigTimer.current) clearTimeout(sigTimer.current);
    if (!q.trim()) {
      setSigResults([]);
      return;
    }
    sigTimer.current = setTimeout(async () => {
      const res = await api<{ results: SearchHit[] }>(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok && res.data) {
        setSigResults((res.data.results ?? []).slice(0, 6).map((r) => ({ id: r.id, title: r.title, year: r.year })));
      }
    }, 300);
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    const [meRes, svcRes] = await Promise.all([
      handle
        ? api("/api/me", { method: "PATCH", body: JSON.stringify({ handle }) })
        : Promise.resolve({ ok: true, status: 200, data: null }),
      api("/api/services", { method: "PUT", body: JSON.stringify({ services: [...selected] }) }),
    ]);
    if (meRes.status === 409) setStatus("That handle is taken.");
    else if (!meRes.ok || !svcRes.ok) setStatus("Save failed — try again.");
    else setStatus("Saved.");
    setSaving(false);
  }

  async function savePassword() {
    setPwStatus(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) setPwStatus(error.message);
    else {
      setPwStatus("Password set — you can now sign in with it anytime.");
      setNewPassword("");
    }
  }

  async function toggleNotify() {
    setNotifyBusy(true);
    setNotifyMsg(null);
    if (notify) {
      await unregisterForPush();
      setNotify(false);
      setNotifyMsg("Reminders off. You'll still find fresh deals in the app.");
    } else {
      const ok = await registerForPush(true);
      setNotify(ok);
      setNotifyMsg(
        ok
          ? "You're on the list — the Friday Night Deal will find you. 🎬"
          : "Turn on notifications for Deep Cut in your phone's Settings, then try again.",
      );
    }
    setNotifyBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function confirmDelete() {
    Alert.alert(
      "Leave the theater?",
      "Deletes everything — profile, loved films, watch history, mixtapes, follows. Can't be undone.",
      [
        { text: "Stay", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: async () => {
            const res = await api("/api/account", { method: "DELETE" });
            if (res.ok) {
              await supabase.auth.signOut().catch(() => {});
              router.replace("/login");
            } else {
              Alert.alert("Deletion failed", "Please try again in a moment.");
            }
          },
        },
      ],
    );
  }

  const initial = (handle || "?").charAt(0).toUpperCase();

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <View>
          <MarqueeBulbs />
          <Eyebrow style={{ marginTop: 8 }}>Projection booth</Eyebrow>
          <Marquee size={40}>SETTINGS</Marquee>
        </View>

        {/* ── Your marquee look ── */}
        <View style={styles.lookCard}>
          <Eyebrow style={{ color: colors.ticket, marginBottom: 12 }}>Your marquee look</Eyebrow>

          <View style={styles.headshotRow}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} contentFit="cover" transition={150} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.lookLabel}>Headshot</Text>
              <Text style={styles.lookHint}>shows on your card & the marquee</Text>
              <View style={{ marginTop: 8, alignSelf: "flex-start" }}>
                <Button
                  title={uploading ? "Developing…" : avatar ? "New photo" : "📸 Add photo"}
                  kind="outline"
                  size="sm"
                  busy={uploading}
                  onPress={() => void pickAvatar()}
                />
              </View>
            </View>
          </View>

          <Text style={[styles.lookLabel, { marginTop: 16 }]}>Card theme</Text>
          <Text style={styles.lookHint}>restyles your whole public card</Text>
          <View style={styles.themeGrid}>
            {PROFILE_THEMES.map((t) => {
              const on = activeTheme === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => {
                    setActiveTheme(t.key);
                    void saveStyle({ theme: t.key });
                  }}
                  style={[styles.themeChip, on && { borderColor: colors.amber, borderWidth: 2 }]}
                >
                  <View style={styles.swatchRow}>
                    {t.swatch.map((c) => (
                      <View key={c} style={[styles.swatch, { backgroundColor: c }]} />
                    ))}
                    <Text style={styles.themeLabel}>{t.label}</Text>
                  </View>
                  <Text style={styles.themeDesc}>{t.desc}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.lookLabel, { marginTop: 16 }]}>Signature film</Text>
          <Text style={styles.lookHint}>its stills become a collage on your card</Text>
          {signature ? (
            <View style={styles.sigChosen}>
              <Text style={styles.sigChosenText} numberOfLines={1}>
                🎞 {signature.title} <Text style={styles.sigYear}>{signature.year ?? ""}</Text>
              </Text>
              <Pressable
                onPress={() => {
                  setSignature(null);
                  void saveStyle({ signatureMovieId: null });
                }}
              >
                <Text style={styles.sigClear}>✕</Text>
              </Pressable>
            </View>
          ) : (
            <TextInput
              value={sigQuery}
              onChangeText={searchSignature}
              placeholder="Search any film…"
              placeholderTextColor="rgba(183,164,145,0.6)"
              style={styles.input}
            />
          )}
          {!signature && sigResults.length > 0 && (
            <View style={styles.resultsCard}>
              {sigResults.map((r, i) => (
                <Pressable
                  key={r.id}
                  onPress={() => {
                    setSignature(r);
                    setSigQuery("");
                    setSigResults([]);
                    void saveStyle({ signatureMovieId: r.id });
                  }}
                  style={[styles.resultRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}
                >
                  <Text style={styles.resultTitle}>
                    {r.title} <Text style={styles.sigYear}>{r.year ?? ""}</Text>
                  </Text>
                  <Text style={{ color: colors.amber, fontFamily: fonts.monoSemi }}>+</Text>
                </Pressable>
              ))}
            </View>
          )}
          {styleMsg && <Text style={styles.errorLine}>{styleMsg}</Text>}
        </View>

        {/* ── Handle ── */}
        <View>
          <Eyebrow style={{ marginBottom: 6 }}>Handle</Eyebrow>
          <TextInput
            value={handle}
            onChangeText={setHandle}
            placeholder="your_handle"
            placeholderTextColor="rgba(183,164,145,0.6)"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
        </View>

        {/* ── Where you watch ──
            Above the services picker: the region decides which services are
            worth offering, so top-to-bottom follows the causality. The list and
            the per-region availability both come from the server rather than
            being duplicated here — services launch and withdraw from markets,
            and a stale copy shipped inside an app binary can't be corrected
            without a release. */}
        <View>
          <Eyebrow style={{ marginBottom: 8 }}>Where you watch</Eyebrow>
          <Pressable onPress={() => setRegionOpen((o) => !o)} style={styles.regionRow}>
            <Text style={styles.regionValue}>{regionLabel}</Text>
            <Text style={styles.regionChange}>{regionOpen ? "Done" : "Change"}</Text>
          </Pressable>
          {regionOpen ? (
            <View style={[styles.chips, { marginTop: 8 }]}>
              {regions.map((r) => (
                <Chip
                  key={r.code}
                  label={r.label}
                  active={r.code === region}
                  onPress={() => void saveRegion(r.code)}
                />
              ))}
            </View>
          ) : null}
          <Text style={styles.regionNote}>
            {regionNote ??
              "Sets which country's streaming catalogue your recommendations are checked against."}
          </Text>
        </View>

        {/* ── Streaming services ── */}
        <View>
          <Eyebrow style={{ marginBottom: 8 }}>Streaming services</Eyebrow>
          <Text style={styles.regionNote}>The ones that operate where you are.</Text>
          <View style={[styles.chips, { marginTop: 8 }]}>
            {SERVICES.filter((s) => availableHere.length === 0 || availableHere.includes(s)).map((s) => (
              <Chip
                key={s}
                label={SERVICE_LABELS[s]}
                active={selected.has(s)}
                onPress={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(s)) next.delete(s);
                    else next.add(s);
                    return next;
                  })
                }
              />
            ))}
          </View>
        </View>

        <Button title={saving ? "Saving…" : "Save settings"} onPress={() => void save()} busy={saving} />
        {status && <Text style={styles.status}>{status}</Text>}

        {/* ── Push notifications ── */}
        <View style={styles.card}>
          <Eyebrow style={{ marginBottom: 6 }}>Notifications</Eyebrow>
          <Text style={styles.line}>
            A fresh deep cut every Friday, plus tags and films people send you.
          </Text>
          <View style={{ marginTop: 10 }}>
            <Button
              title={notify ? "Turn off notifications" : "🔔 Turn on notifications"}
              kind={notify ? "outline" : "primary"}
              busy={notifyBusy}
              onPress={() => void toggleNotify()}
            />
          </View>
          {notifyMsg && <Text style={styles.status}>{notifyMsg}</Text>}
        </View>

        {/* ── Password ── */}
        <View style={styles.card}>
          <Eyebrow style={{ marginBottom: 6 }}>Password</Eyebrow>
          <Text style={styles.line}>Sign in without an email link.</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New password (8+ chars)"
              placeholderTextColor="rgba(183,164,145,0.6)"
              secureTextEntry
              autoCapitalize="none"
              style={[styles.input, { flex: 1 }]}
            />
            <Button title="Set" kind="outline" disabled={newPassword.length < 8} onPress={() => void savePassword()} />
          </View>
          {pwStatus && <Text style={styles.status}>{pwStatus}</Text>}
        </View>

        {/* ── The door (owners only) ── */}
        {doorCount !== null && (
          <View style={styles.doorCard}>
            <Eyebrow style={{ color: colors.amber, marginBottom: 4 }}>The door</Eyebrow>
            <Text style={styles.line}>
              {doorCount === 0
                ? "Nobody waiting."
                : `${doorCount} ${doorCount === 1 ? "person" : "people"} waiting to get in.`}
            </Text>
            <View style={{ marginTop: 10, alignSelf: "flex-start" }}>
              <Button title="🚪 Work the line" kind="outline" onPress={() => router.push("/door")} />
            </View>
          </View>
        )}

        {/* ── The studio tour ── */}
        <View style={styles.card}>
          <Eyebrow style={{ marginBottom: 6 }}>The studio tour</Eyebrow>
          <Text style={styles.line}>The nine-stop walk through the house.</Text>
          <View style={{ marginTop: 10, alignSelf: "flex-start" }}>
            <Button
              title="🎬 Play it again"
              kind="outline"
              onPress={() => {
                void resetStudioTour().then(() => router.replace("/tonight"));
              }}
            />
          </View>
        </View>

        {/* ── Account ── */}
        <View style={styles.card}>
          <Eyebrow style={{ marginBottom: 6 }}>Account</Eyebrow>
          <Text style={styles.line}>{session?.user.email}</Text>
          <View style={{ marginTop: 10 }}>
            <Button title="🚪 Sign out" kind="outline" onPress={() => void signOut()} />
          </View>
        </View>

        <Text style={styles.legal}>
          <Text style={styles.legalLink} onPress={() => void WebBrowser.openBrowserAsync(`${CONFIG.apiBaseUrl}/terms`)}>
            Terms of Use
          </Text>
          {"  ·  "}
          <Text style={styles.legalLink} onPress={() => void WebBrowser.openBrowserAsync(`${CONFIG.apiBaseUrl}/privacy`)}>
            Privacy Policy
          </Text>
        </Text>

        {/* ── Danger zone ── */}
        <View style={styles.dangerCard}>
          <Eyebrow style={{ color: colors.ticket, marginBottom: 4 }}>Leave the theater</Eyebrow>
          {/* The confirm dialog spells out what's lost — no need to say it twice. */}
          <Text style={styles.line}>Permanent. Everything goes.</Text>
          <View style={{ marginTop: 10, alignSelf: "flex-start" }}>
            <Button title="Delete account" kind="outline" onPress={confirmDelete} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 10, padding: 14 },
  doorCard: {
    backgroundColor: colors.surface,
    borderColor: colors.amber,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  lookCard: {
    backgroundColor: colors.surface,
    borderColor: colors.ticket,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 10,
    padding: 14,
  },
  headshotRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.bg },
  avatarFallback: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line },
  avatarInitial: { color: colors.amber, fontFamily: fonts.display, fontSize: 28 },
  lookLabel: { color: colors.cream, fontFamily: fonts.mono, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  lookHint: { color: colors.dim, fontFamily: fonts.mono, fontSize: 9.5, marginTop: 2 },
  themeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  themeChip: {
    width: "48%",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    padding: 10,
  },
  swatchRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.bg },
  themeLabel: { color: colors.cream, fontFamily: fonts.display, fontSize: 16, marginLeft: 2 },
  themeDesc: { color: colors.dim, fontFamily: fonts.mono, fontSize: 8, marginTop: 4 },
  sigChosen: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(255,180,84,0.6)",
    backgroundColor: colors.bg,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  sigChosenText: { color: colors.cream, fontFamily: fonts.body, fontSize: 14, flexShrink: 1 },
  sigYear: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11 },
  sigClear: { color: colors.ticket, fontFamily: fonts.mono, fontSize: 14, marginLeft: 10 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    backgroundColor: colors.surface,
    color: colors.cream,
    fontFamily: fonts.body,
    fontSize: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  resultsCard: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    borderRadius: 6,
    marginTop: 6,
    overflow: "hidden",
  },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  resultTitle: { color: colors.cream, fontFamily: fonts.body, fontSize: 14, flexShrink: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  regionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  regionValue: { color: colors.cream, fontSize: 15 },
  regionChange: {
    fontFamily: mono,
    fontSize: 11,
    color: colors.amber,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  regionNote: { fontFamily: mono, fontSize: 10.5, color: colors.dim, lineHeight: 16, marginTop: 6 },
  status: { color: colors.amber, fontFamily: mono, fontSize: 12, marginTop: 8 },
  errorLine: { color: colors.ticket, fontFamily: mono, fontSize: 12, marginTop: 10 },
  line: { color: colors.cream, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  legal: { textAlign: "center", marginTop: 4 },
  legalLink: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11, textDecorationLine: "underline" },
  dangerCard: { borderWidth: 1, borderColor: "rgba(228,87,61,0.5)", borderRadius: 10, padding: 14, marginTop: 4 },
});
