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
import { Button, Eyebrow, Marquee, MarqueeBulbs } from "@/components/ui";
import { api } from "@/lib/api";
import { CONFIG } from "@/lib/config";
import { colors, fonts } from "@/lib/theme";
import type { SearchHit } from "@/lib/types";

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

function ProgressBar({ items }: { items: Array<{ crossed_off: boolean }> }) {
  const { done, total, pct } = progress(items);
  return (
    <View style={{ marginTop: 6 }}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.progressText}>
        {done}/{total} crossed off
      </Text>
    </View>
  );
}

export default function Mixtapes() {
  const [sent, setSent] = useState<PlaylistRow[]>([]);
  const [received, setReceived] = useState<PlaylistRow[]>([]);
  const [pickPool, setPickPool] = useState<PoolFilm[]>([]);
  const [loading, setLoading] = useState(true);

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
          <Eyebrow>Mixtape sealed</Eyebrow>
          <Marquee size={38}>SEND IT</Marquee>
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
          <Eyebrow>New mixtape</Eyebrow>
          <Marquee size={38}>MAKE A PLAYLIST</Marquee>

          <TextInput
            value={name}
            onChangeText={(t) => setName(t.slice(0, 80))}
            placeholder="Name it — “movies to fix your October”"
            placeholderTextColor="rgba(183,164,145,0.6)"
            style={styles.input}
          />
          <TextInput
            value={recipient}
            onChangeText={(t) => setRecipient(t.slice(0, 60))}
            placeholder="For… (optional)"
            placeholderTextColor="rgba(183,164,145,0.6)"
            style={styles.input}
          />
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
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <MarqueeBulbs />
            <Eyebrow style={{ marginTop: 8 }}>Playlists</Eyebrow>
            <Marquee size={38}>MOVIE MIXTAPES</Marquee>
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
                    <Pressable
                      key={p.id}
                      style={styles.tapeCard}
                      onPress={() => router.push(`/playlist/${p.id}`)}
                    >
                      <View style={styles.tapeTop}>
                        <View style={styles.tapeNameRow}>
                          <Text style={styles.tapeName} numberOfLines={1}>
                            {p.name}
                          </Text>
                          {p.is_public === false && (
                            <View style={styles.privateBadge}>
                              <Text style={styles.privateBadgeText}>🔒 Private</Text>
                            </View>
                          )}
                        </View>
                        {p.recipient_name ? (
                          <Text style={styles.forName}>for {p.recipient_name}</Text>
                        ) : null}
                      </View>
                      <ProgressBar items={p.playlist_items} />
                    </Pressable>
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
                    <Pressable
                      key={p.id}
                      style={styles.tapeCard}
                      onPress={() => router.push(`/playlist/${p.id}`)}
                    >
                      <Text style={styles.tapeName}>{p.name}</Text>
                      <ProgressBar items={p.playlist_items} />
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
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
  tapeCard: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 6,
    padding: 12,
  },
  tapeTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  tapeNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1, minWidth: 0 },
  tapeName: { color: colors.cream, fontFamily: fonts.display, fontSize: 18, letterSpacing: 0.5, flexShrink: 1 },
  privateBadge: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 3,
    paddingVertical: 2,
    paddingHorizontal: 5,
  },
  privateBadgeText: {
    color: colors.dim,
    fontFamily: fonts.mono,
    fontSize: 7.5,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  forName: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10 },
  track: { height: 6, width: "100%", borderRadius: 999, backgroundColor: colors.bg, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 999, backgroundColor: colors.avail },
  progressText: { color: colors.dim, fontFamily: fonts.mono, fontSize: 9.5, marginTop: 4 },
  // create
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
