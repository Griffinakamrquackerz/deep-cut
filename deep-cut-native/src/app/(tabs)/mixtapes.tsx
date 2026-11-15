import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Confetti from "@/components/Confetti";
import { Button, Eyebrow, Marquee } from "@/components/ui";
import { api } from "@/lib/api";
import { CONFIG } from "@/lib/config";
import { colors, fonts } from "@/lib/theme";
import type { SearchHit } from "@/lib/types";
import { ReelEnd, Slate, Tape } from "@/components/house";
import { tapeStripes } from "@/lib/tape";

// The Mixtapes room — native port of the web PlaylistsScreen. Three inline
// states, same as web: the list (Sent / Received), the create flow, and the
// "sealed, here's the link" send screen.

interface PlaylistRow {
  id: string;
  name: string;
  recipient_name?: string | null;
  share_slug: string;
  created_at: string;
  playlist_items: Array<{ crossed_off: boolean }>;
  is_public?: boolean;
}

interface PoolFilm {
  id: number;
  title: string;
  year: number | null;
}

function progress(items: Array<{ crossed_off: boolean }>) {
  const total = items.length;
  const done = items.filter((i) => i.crossed_off).length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export default function Mixtapes() {
  const [sent, setSent] = useState<PlaylistRow[]>([]);
  const [received, setReceived] = useState<PlaylistRow[]>([]);
  const [pickPool, setPickPool] = useState<PoolFilm[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<ScrollView>(null);

  // create flow
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [recipient, setRecipient] = useState("");
  const [picks, setPicks] = useState<Map<number, PoolFilm>>(new Map());
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PoolFilm[]>([]);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const res = await api<{ sent: PlaylistRow[]; received: PlaylistRow[]; pickPool: PoolFilm[] }>(
      "/api/playlists",
    );
    if (res.ok && res.data) {
      setSent(res.data.sent ?? []);
      setReceived(res.data.received ?? []);
      setPickPool(res.data.pickPool ?? []);
    }
    setLoading(false);
  }, []);

  // Reload the list every time the tab regains focus (a crossed-off film in a
  // detail screen should show updated progress when you come back).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function search(q: string) {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      const res = await api<{ results: SearchHit[] }>(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok && res.data) {
        setResults(
          (res.data.results ?? []).slice(0, 6).map((r) => ({ id: r.id, title: r.title, year: r.year })),
        );
      }
    }, 300);
  }

  function toggle(f: PoolFilm) {
    void Haptics.selectionAsync();
    setPicks((prev) => {
      const next = new Map(prev);
      if (next.has(f.id)) next.delete(f.id);
      else if (next.size < 30) next.set(f.id, f);
      return next;
    });
  }

  async function create() {
    setBusy(true);
    const res = await api<{ id: string; shareSlug: string }>("/api/playlists", {
      method: "POST",
      body: JSON.stringify({
        name,
        recipientName: recipient.trim() || null,
        movieIds: [...picks.keys()],
      }),
    });
    setBusy(false);
    if (res.ok && res.data) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShareLink(`${CONFIG.apiBaseUrl}/p/${res.data.shareSlug}`);
      void load();
    }
  }

  function resetCreate() {
    setShareLink(null);
    setCreating(false);
    setPicks(new Map());
    setName("");
    setRecipient("");
    setQuery("");
    setResults([]);
  }

  // ── Sealed / send screen ──
  if (shareLink) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <Confetti fire={1} />
        <ScrollView contentContainerStyle={styles.body}>
          <Slate>Mixtape sealed</Slate>
          <Marquee size={38} accent="it">SEND IT</Marquee>
          <View style={styles.linkCard}>
            <Text style={styles.linkText}>{shareLink}</Text>
          </View>
          <View style={{ gap: 10, marginTop: 4 }}>
            <Button
              title="Send the link"
              onPress={() => void Share.share({ message: shareLink })}
            />
            <Button title="Done" kind="outline" onPress={resetCreate} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Create flow ──
  if (creating) {
    const count = picks.size;
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Slate>New mixtape</Slate>
          <Marquee size={38} accent="playlist">MAKE A PLAYLIST</Marquee>

          {/* A blank tape. You write its name on the label, in pen. */}
          <View style={styles.blank}>
            <View style={styles.blankLabel}>
              <View style={styles.blankTop}>
                <Text style={styles.blankSmall}>DEEP CUT VIDEO</Text>
                <Text style={styles.blankSmall}>
                  SIDE A · {count} FILM{count === 1 ? "" : "S"}
                </Text>
              </View>
              <TextInput
                value={name}
                onChangeText={(t) => setName(t.slice(0, 80))}
                placeholder="Name this tape…"
                placeholderTextColor="rgba(42,28,21,0.38)"
                accessibilityLabel="Mixtape name"
                style={styles.write}
              />
              <TextInput
                value={recipient}
                onChangeText={(t) => setRecipient(t.slice(0, 60))}
                placeholder="For… (optional)"
                placeholderTextColor="rgba(42,28,21,0.38)"
                accessibilityLabel="Who it's for"
                style={[styles.write, styles.writeSmall]}
              />
              <View style={styles.blankStripes}>
                {tapeStripes(name || "blank").map((c, i) => (
                  <View key={i} style={{ flex: 1, backgroundColor: c }} />
                ))}
              </View>
            </View>
            <View style={styles.blankWindow}>
              <View style={styles.blankSpool} />
              <View style={styles.blankTapeRun} />
              <View style={styles.blankSpool} />
            </View>
          </View>
          <TextInput
            value={query}
            onChangeText={search}
            placeholder="Search any film…"
            placeholderTextColor="rgba(183,164,145,0.6)"
            autoCorrect={false}
            style={styles.input}
          />

          {results.length > 0 && (
            <View style={styles.resultsCard}>
              {results.map((r, i) => (
                <Pressable
                  key={r.id}
                  onPress={() => {
                    toggle(r);
                    setQuery("");
                    setResults([]);
                  }}
                  style={[styles.resultRow, i > 0 && styles.resultDivider]}
                >
                  <Text style={styles.resultTitle}>
                    {r.title} <Text style={styles.resultYear}>{r.year ?? ""}</Text>
                  </Text>
                  <Text style={styles.resultPlus}>{picks.has(r.id) ? "✓" : "+"}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {pickPool.length > 0 && (
            <>
              <Eyebrow style={{ marginTop: 4 }}>From your watchlist & loved films</Eyebrow>
              <View style={styles.chipWrap}>
                {pickPool.map((f) => {
                  const on = picks.has(f.id);
                  return (
                    <Pressable
                      key={f.id}
                      onPress={() => toggle(f)}
                      style={[styles.poolChip, on ? styles.poolChipOn : styles.poolChipOff]}
                    >
                      <Text style={[styles.poolChipText, { color: on ? colors.amber : colors.cream }]}>
                        {f.title} {f.year ? `(${f.year})` : ""}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {count > 0 && (
            <Text style={styles.tapeCount}>
              {count} film{count === 1 ? "" : "s"} on the tape
            </Text>
          )}

          <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
            <View style={{ flex: 1 }}>
              <Button title="Cancel" kind="outline" onPress={() => setCreating(false)} />
            </View>
            <View style={{ flex: 2 }}>
              <Button
                title={busy ? "Sealing…" : "Create & get link"}
                busy={busy}
                disabled={!name.trim() || count === 0}
                onPress={() => void create()}
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── List ──
  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.body}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Slate>Playlists</Slate>
            <Marquee size={38} accent="mixtapes">MOVIE MIXTAPES</Marquee>
          </View>
          <Pressable style={styles.newBtn} onPress={() => setCreating(true)}>
            <Text style={styles.newBtnText}>+ New</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 32, alignItems: "center" }}>
            <ActivityIndicator color={colors.amber} />
          </View>
        ) : (
          <>
            <View style={{ marginTop: 8 }}>
              <Eyebrow style={{ marginBottom: 8 }}>Sent</Eyebrow>
              {sent.length === 0 ? (
                <Text style={styles.dim}>
                  No mixtapes yet. Nobody forgets the person who made them a tape.
                </Text>
              ) : (
                <View style={{ gap: 8 }}>
                  {sent.map((p) => (
                    <Tape
                      key={p.id}
                      id={p.id}
                      name={p.name}
                      meta={p.recipient_name ? `FOR ${p.recipient_name.toUpperCase()}` : "FROM YOU"}
                      done={progress(p.playlist_items).done}
                      total={p.playlist_items.length}
                      sticker={p.is_public === false ? "Private" : undefined}
                      onPress={() => router.push(`/playlist/${p.id}`)}
                    />
                  ))}
                </View>
              )}
            </View>

            <View style={{ marginTop: 16 }}>
              <Eyebrow style={{ marginBottom: 8 }}>Received</Eyebrow>
              {received.length === 0 ? (
                <Text style={styles.dim}>Nothing in the mailbox yet.</Text>
              ) : (
                <View style={{ gap: 8 }}>
                  {received.map((p) => (
                    <Tape
                      key={p.id}
                      id={p.id}
                      name={p.name}
                      meta="MADE FOR YOU"
                      done={progress(p.playlist_items).done}
                      total={p.playlist_items.length}
                      sticker="For you"
                      stickerKind="green"
                      onPress={() => router.push(`/playlist/${p.id}`)}
                    />
                  ))}
                </View>
              )}
            </View>
          </>
        )}
        <ReelEnd onRewind={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, paddingBottom: 40, gap: 12 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  newBtn: {
    backgroundColor: colors.ticket,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 24,
  },
  newBtnText: {
    color: colors.cream,
    fontFamily: fonts.monoSemi,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  dim: { color: colors.dim, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  // create — a blank tape (web: .tape-face / .tape-write)
  blank: { borderRadius: 10, backgroundColor: "#14100e", borderWidth: 1, borderColor: "#000", padding: 10 },
  blankLabel: { backgroundColor: colors.paper, borderRadius: 3, overflow: "hidden", padding: 12, paddingBottom: 22 },
  blankTop: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  blankSmall: { color: colors.paperDim, fontFamily: fonts.mono, fontSize: 8.5, letterSpacing: 1.8 },
  write: {
    borderBottomWidth: 1.5,
    borderBottomColor: "rgba(42,28,21,0.55)",
    color: "#1d2a5c",
    fontFamily: fonts.serif,
    fontSize: 30,
    paddingVertical: 2,
    marginTop: 8,
  },
  writeSmall: { fontSize: 20 },
  blankStripes: { position: "absolute", left: 0, right: 0, bottom: 0, height: 8, flexDirection: "row" },
  blankWindow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "center",
    width: "62%",
    marginTop: 10,
    borderRadius: 999,
    backgroundColor: "#0a0807",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  blankSpool: { width: 30, height: 30, borderRadius: 15, borderWidth: 6, borderColor: "#3d2a1e", backgroundColor: "#0a0807" },
  blankTapeRun: { flex: 1, height: 2, marginHorizontal: 6, backgroundColor: "rgba(61,42,30,0.7)" },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: colors.cream,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  resultsCard: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 6,
    overflow: "hidden",
  },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  resultDivider: { borderTopWidth: 1, borderTopColor: colors.line },
  resultTitle: { color: colors.cream, fontFamily: fonts.body, fontSize: 14, flexShrink: 1 },
  resultYear: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11 },
  resultPlus: { color: colors.amber, fontFamily: fonts.monoSemi, fontSize: 16, paddingLeft: 10 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  poolChip: { borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  poolChipOn: { borderColor: colors.amber },
  poolChipOff: { borderColor: colors.line },
  poolChipText: { fontFamily: fonts.body, fontSize: 12 },
  tapeCount: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11 },
  // sealed
  linkCard: {
    borderWidth: 1,
    borderColor: colors.ticket,
    borderStyle: "dashed",
    backgroundColor: colors.surface,
    borderRadius: 6,
    padding: 14,
    marginTop: 4,
  },
  linkText: { color: colors.amber, fontFamily: fonts.mono, fontSize: 12 },
});
