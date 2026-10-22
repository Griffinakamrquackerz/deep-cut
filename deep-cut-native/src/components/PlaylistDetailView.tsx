import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BackButton from "./BackButton";
import HouseNav from "./HouseNav";
import Confetti from "@/components/Confetti";
import RatingLine from "@/components/RatingLine";
import { Eyebrow, Marquee, Poster } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, fonts } from "@/lib/theme";
import { reportContent } from "@/lib/report";

// Shared mixtape detail — native port of the web PlaylistDetail. Cross films
// off, leave a reaction and a note, flip a tape public/private (owner only),
// and tap any film for its full page. Fed by either /api/playlists/[id]
// (owned/received) or /api/playlists/by-slug/[slug] (a shared link) — both
// return the same Detail shape, so this one view renders both routes.

const REACTIONS = [
  { value: "loved", label: "♥ loved" },
  { value: "fine", label: "— fine" },
  { value: "not_for_me", label: "✕ not for me" },
  { value: "loved_ironically", label: "🃏 ironically" },
] as const;

interface ItemMovie {
  id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  genres: string[];
  runtime: number | null;
  tmdb_rating?: number | null;
  imdb_rating?: number | null;
  rt_rating?: number | null;
}

interface Item {
  id: string;
  crossed_off: boolean;
  reaction: string | null;
  note: string | null;
  position: number;
  movies: ItemMovie | null;
}

interface Detail {
  id: string;
  name: string;
  ownerName: string;
  recipientName: string | null;
  slug: string;
  viewerIsOwner: boolean;
  isPublic: boolean;
  items: Item[];
}

export default function PlaylistDetailView({ endpoint }: { endpoint: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [confetti, setConfetti] = useState(0);
  const [isPublic, setIsPublic] = useState(true);
  const [visSaving, setVisSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await api<Detail>(endpoint);
    if (res.ok && res.data) {
      setDetail(res.data);
      setItems(res.data.items ?? []);
      setIsPublic(res.data.isPublic);
    }
    setLoading(false);
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = items.length;
  const done = items.filter((i) => i.crossed_off).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  async function update(itemId: string, patch: Record<string, unknown>) {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== itemId) return i;
        const out = { ...i };
        if ("crossedOff" in patch) out.crossed_off = Boolean(patch.crossedOff);
        if ("reaction" in patch) out.reaction = patch.reaction as string | null;
        if ("note" in patch) out.note = patch.note as string | null;
        return out;
      }),
    );
    // Recipients hold the tape by capability (the share slug); owner is authed.
    await api(`/api/playlists/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ ...patch, slug: detail?.slug }),
    });
  }

  function toggleCross(item: Item) {
    const next = !item.crossed_off;
    if (next) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const remaining = items.filter((x) => !x.crossed_off).length;
      if (remaining === 1) setConfetti((c) => c + 1); // last one → the tape is done
    }
    void update(item.id, { crossedOff: next });
  }

  async function toggleVisibility() {
    if (!detail || visSaving) return;
    const next = !isPublic;
    setIsPublic(next); // optimistic
    setVisSaving(true);
    const res = await api("/api/playlists/visibility", {
      method: "POST",
      body: JSON.stringify({ playlistId: detail.id, isPublic: next }),
    });
    if (!res.ok) setIsPublic(!next); // revert
    setVisSaving(false);
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <Confetti fire={confetti} />
      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={colors.amber} />
        </View>
      ) : !detail ? (
        <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
          <Text style={styles.dim}>This mixtape isn&apos;t here anymore.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <BackButton style={{ marginBottom: 12 }} />
          <Eyebrow>
            A mixtape from {detail.ownerName}
            {detail.recipientName ? ` · for ${detail.recipientName}` : ""}
          </Eyebrow>
          <Marquee size={36}>{detail.name.toUpperCase()}</Marquee>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${pct}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {done}/{total} crossed off
          </Text>

          <View style={{ gap: 12, marginTop: 4 }}>
            {items
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((item) => {
                const m = item.movies;
                if (!m) return null;
                return (
                  <View key={item.id} style={[styles.itemCard, item.crossed_off && { opacity: 0.6 }]}>
                    <Pressable style={{ width: 64 }} onPress={() => router.push(`/m/${m.id}`)}>
                      <Poster path={m.poster_path} title={m.title} year={m.year} width={64} />
                    </Pressable>
                    <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                      <Pressable style={styles.crossRow} onPress={() => toggleCross(item)}>
                        <View style={[styles.check, item.crossed_off && styles.checkOn]}>
                          {item.crossed_off && <Text style={styles.checkMark}>✓</Text>}
                        </View>
                        <Text style={[styles.itemTitle, item.crossed_off && styles.itemTitleCrossed]}>
                          {m.title} <Text style={styles.itemYear}>{m.year ?? ""}</Text>
                        </Text>
                      </Pressable>

                      <RatingLine
                        imdb={m.imdb_rating}
                        rt={m.rt_rating}
                        tmdb={m.tmdb_rating}
                        genres={m.genres}
                      />

                      <View style={styles.reactionRow}>
                        {REACTIONS.map((r) => {
                          const on = item.reaction === r.value;
                          return (
                            <Pressable
                              key={r.value}
                              onPress={() => {
                                void Haptics.selectionAsync();
                                void update(item.id, { reaction: on ? null : r.value });
                              }}
                              style={[styles.reactionChip, on && styles.reactionChipOn]}
                            >
                              <Text style={[styles.reactionText, on && { color: colors.amber }]}>
                                {r.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      {item.note && !(item.id in noteDraft) ? (
                        <View style={styles.noteReadRow}>
                          <Pressable
                            style={{ flex: 1 }}
                            onPress={() => setNoteDraft((d) => ({ ...d, [item.id]: item.note ?? "" }))}
                          >
                            <Text style={styles.noteText}>“{item.note}”</Text>
                          </Pressable>
                          {/* The owner reads notes their recipient wrote, and
                              had no way to report one. The backend has taken
                              `playlist` reports all along. Owner only — on the
                              recipient's side the note is their own. */}
                          {detail.viewerIsOwner && (
                            <Pressable
                              hitSlop={10}
                              accessibilityLabel="Report this note"
                              onPress={() => reportContent("playlist", detail.id, { title: "Report this note" })}
                            >
                              <Text style={styles.noteFlag}>⚑</Text>
                            </Pressable>
                          )}
                        </View>
                      ) : (
                        <View style={styles.noteRow}>
                          <TextInput
                            value={noteDraft[item.id] ?? ""}
                            onChangeText={(t) => setNoteDraft((d) => ({ ...d, [item.id]: t.slice(0, 300) }))}
                            placeholder="Leave a note…"
                            placeholderTextColor="rgba(183,164,145,0.6)"
                            style={styles.noteInput}
                          />
                          <Pressable
                            style={styles.noteSave}
                            onPress={() => {
                              const note = (noteDraft[item.id] ?? "").trim() || null;
                              void update(item.id, { note });
                              setNoteDraft((d) => {
                                const { [item.id]: _drop, ...rest } = d;
                                return rest;
                              });
                            }}
                          >
                            <Text style={styles.noteSaveText}>Save</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
          </View>

          {detail.viewerIsOwner && (
            <View style={styles.ownerBox}>
              <Pressable style={styles.visToggle} onPress={() => void toggleVisibility()} disabled={visSaving}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.visTitle}>
                    {isPublic ? "🌐 Public mixtape" : "🔒 Private mixtape"}
                  </Text>
                  <Text style={styles.visSub}>
                    {isPublic
                      ? "on your profile & anyone with the link can open it"
                      : "only you can see this — hidden from your profile & the link"}
                  </Text>
                </View>
                <View style={[styles.visPill, isPublic ? styles.visPillOn : styles.visPillOff]}>
                  <Text style={[styles.visPillText, { color: isPublic ? colors.avail : colors.dim }]}>
                    {visSaving ? "…" : isPublic ? "Public" : "Private"}
                  </Text>
                </View>
              </Pressable>
              <Text style={styles.ownerNote}>
                You made this tape. Reactions and notes above are your recipient&apos;s.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
      {/* A mixtape is always a pushed screen, so the tab bar isn't there. */}
      <HouseNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, paddingBottom: 112, gap: 6 },
  dim: { color: colors.dim, fontFamily: fonts.body, fontSize: 15, textAlign: "center" },
  track: {
    height: 6,
    width: "100%",
    borderRadius: 999,
    backgroundColor: colors.surface,
    overflow: "hidden",
    marginTop: 8,
  },
  fill: { height: "100%", borderRadius: 999, backgroundColor: colors.avail },
  progressText: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10, marginTop: 4 },
  itemCard: {
    flexDirection: "row",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 6,
    padding: 12,
  },
  crossRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  check: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.dim,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkOn: { borderColor: colors.avail, backgroundColor: colors.avail },
  checkMark: { color: colors.bg, fontFamily: fonts.monoSemi, fontSize: 12, lineHeight: 14 },
  itemTitle: { flex: 1, color: colors.cream, fontFamily: fonts.display, fontSize: 18, lineHeight: 20 },
  itemTitleCrossed: { textDecorationLine: "line-through", textDecorationColor: colors.ticket },
  itemYear: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11 },
  genres: {
    color: "rgba(255,180,84,0.7)",
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  reactionRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  reactionChip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  reactionChipOn: { borderColor: colors.amber },
  reactionText: {
    color: colors.dim,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  noteText: { color: colors.dim, fontFamily: fonts.bodyItalic, fontSize: 12 },
  noteReadRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  noteFlag: { fontFamily: fonts.mono, fontSize: 12, color: colors.dim, paddingTop: 2 },
  noteRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  noteInput: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    color: colors.cream,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  noteSave: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  noteSaveText: {
    color: colors.dim,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  ownerBox: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    borderStyle: "dashed",
    paddingTop: 16,
    gap: 8,
  },
  visToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 6,
    padding: 12,
  },
  visTitle: {
    color: colors.cream,
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  visSub: { color: colors.dim, fontFamily: fonts.mono, fontSize: 9, marginTop: 2 },
  visPill: { borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  visPillOn: { borderColor: colors.avail },
  visPillOff: { borderColor: colors.line },
  visPillText: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase" },
  ownerNote: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10, textAlign: "center" },
});
