import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import LetterboxdImport from "@/components/LetterboxdImport";
import { primaryRatingLabel } from "@/components/RatingLine";
import { Poster } from "@/components/ui";
import { api } from "@/lib/api";
import { CONFIG } from "@/lib/config";
import { colors, fonts } from "@/lib/theme";
import type { SearchHit } from "@/lib/types";

// "Your booth" — the management tools below the member card on the You tab,
// mirroring the web YouScreen: streak, share/refresh, your watchlist, and the
// shape-your-taste editor (Letterboxd import + loved films add/remove).

interface MovieLite {
  id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  genres: string[];
  tmdb?: number | null;
  imdb?: number | null;
  rt?: number | null;
}
interface Booth {
  handle: string | null;
  streak: { weeks: number; atRisk: boolean; loggedThisWeek: boolean };
  watchlist: Array<{ id: string; obscurity: number; movie: MovieLite }>;
  loved: MovieLite[];
}

export default function YouBooth() {
  const [booth, setBooth] = useState<Booth | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [lovedShown, setLovedShown] = useState(24);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const res = await api<Booth>("/api/me/booth");
    if (res.ok && res.data) setBooth(res.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function refreshTaste() {
    setRefreshing(true);
    setMsg(null);
    const res = await api("/api/profile/generate", { method: "POST" });
    if (res.status === 429) setMsg("One refresh a day — let it marinate.");
    else if (!res.ok) setMsg("Refresh failed. Try again later.");
    else setMsg("Taste rebuilt — your card updates next visit.");
    setRefreshing(false);
  }

  async function shareCard() {
    const key = booth?.handle;
    if (!key) {
      router.push("/(tabs)/settings"); // set a handle first
      return;
    }
    await Share.share({ message: `My Deep Cut taste card: ${CONFIG.apiBaseUrl}/u/${key}` }).catch(() => {});
  }

  function search(q: string) {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      const res = await api<{ results: SearchHit[] }>(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok && res.data) setResults((res.data.results ?? []).slice(0, 6));
    }, 300);
  }

  async function addLoved(id: number) {
    setQuery("");
    setResults([]);
    await api("/api/loved", { method: "POST", body: JSON.stringify({ movieId: id }) });
    void load();
  }

  async function removeLoved(id: number) {
    await api("/api/loved", { method: "DELETE", body: JSON.stringify({ movieId: id }) });
    void load();
  }

  const streak = booth?.streak;

  return (
    <View style={styles.wrap}>
      <Text style={styles.eyebrow}>Your booth · where the card gets made</Text>

      {/* Streak */}
      {streak && (
        <View style={styles.streak}>
          <Text style={styles.streakText}>
            {streak.weeks > 0
              ? `🔥 ${streak.weeks}-week streak${streak.atRisk ? " · log one this week to keep it" : ""}`
              : "Start a streak — log a watch this week 🔥"}
          </Text>
        </View>
      )}

      {/* Share + refresh toolbar */}
      <View style={styles.toolbar}>
        <Pressable style={styles.shareBtn} onPress={() => void shareCard()}>
          <Text style={styles.shareBtnText}>🎟 Share my card</Text>
        </Pressable>
        <Pressable style={styles.refreshBtn} onPress={() => void refreshTaste()} disabled={refreshing}>
          <Text style={styles.refreshBtnText}>{refreshing ? "…" : "Refresh taste"}</Text>
        </Pressable>
      </View>
      {msg && <Text style={styles.msg}>{msg}</Text>}

      {/* Watchlist */}
      <View>
        <Text style={styles.sectionEyebrow}>Your watchlist</Text>
        {booth && booth.watchlist.length === 0 ? (
          <Text style={styles.dim}>Nothing saved yet — hit ＋ Watchlist on a deal.</Text>
        ) : (
          <View style={styles.grid}>
            {(booth?.watchlist ?? []).map((w) => (
              <Pressable key={w.id} style={styles.gridItem} onPress={() => router.push(`/m/${w.movie.id}`)}>
                <Poster
                  path={w.movie.poster_path}
                  title={w.movie.title}
                  year={w.movie.year}
                  width={GRID_W}
                  badge={primaryRatingLabel({ imdb: w.movie.imdb, rt: w.movie.rt, tmdb: w.movie.tmdb })}
                />
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Shape your taste */}
      <View>
        <Text style={styles.sectionEyebrow}>Shape your taste</Text>
        <View style={{ gap: 12 }}>
          <LetterboxdImport onDone={load} />
          <TextInput
            value={query}
            onChangeText={search}
            placeholder="Search any film to add — all of TMDB…"
            placeholderTextColor="rgba(183,164,145,0.6)"
            autoCorrect={false}
            style={styles.input}
          />
          <Text style={styles.hint}>
            Add or ✕ remove films, then hit Refresh taste up top to reshape your profile.
          </Text>
          {results.length > 0 && (
            <View style={styles.resultsCard}>
              {results.map((r, i) => (
                <Pressable
                  key={r.id}
                  onPress={() => void addLoved(r.id)}
                  style={[styles.resultRow, i > 0 && styles.resultDivider]}
                >
                  <Text style={styles.resultTitle}>
                    {r.title} <Text style={styles.resultYear}>{r.year ?? ""}</Text>
                  </Text>
                  <Text style={styles.plus}>+</Text>
                </Pressable>
              ))}
            </View>
          )}
          <View style={styles.grid}>
            {(booth?.loved ?? []).slice(0, lovedShown).map((m) => (
              <View key={m.id} style={styles.gridItem}>
                <Pressable onPress={() => router.push(`/m/${m.id}`)}>
                  <Poster
                    path={m.poster_path}
                    title={m.title}
                    year={m.year}
                    width={GRID_W}
                    badge={primaryRatingLabel({ imdb: m.imdb, rt: m.rt, tmdb: m.tmdb })}
                  />
                </Pressable>
                <Pressable style={styles.removeBadge} onPress={() => void removeLoved(m.id)} hitSlop={8}>
                  <Text style={styles.removeText}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>
          {(booth?.loved.length ?? 0) > lovedShown && (
            <Pressable style={styles.more} onPress={() => setLovedShown((n) => n + 24)}>
              <Text style={styles.moreText}>Roll more posters ↓</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const GRID_W = 96;

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    borderStyle: "dashed",
    paddingTop: 20,
    gap: 16,
  },
  eyebrow: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11, letterSpacing: 3, textTransform: "uppercase" },
  streak: {
    borderWidth: 1,
    borderColor: "rgba(255,180,84,0.4)",
    backgroundColor: "rgba(255,180,84,0.06)",
    borderRadius: 8,
    padding: 12,
  },
  streakText: { color: colors.amber, fontFamily: fonts.mono, fontSize: 12 },
  toolbar: { flexDirection: "row", gap: 8 },
  shareBtn: { flex: 1, backgroundColor: colors.amber, borderRadius: 6, paddingVertical: 11, alignItems: "center" },
  shareBtnText: { color: colors.bg, fontFamily: fonts.monoSemi, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase" },
  refreshBtn: { borderWidth: 1, borderColor: colors.line, borderRadius: 6, paddingVertical: 11, paddingHorizontal: 14, alignItems: "center" },
  refreshBtnText: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase" },
  msg: { color: colors.amber, fontFamily: fonts.mono, fontSize: 11 },
  sectionEyebrow: {
    color: colors.dim,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  dim: { color: colors.dim, fontFamily: fonts.body, fontSize: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  gridItem: { position: "relative" },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 6,
    paddingVertical: 11,
    paddingHorizontal: 12,
    color: colors.cream,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  hint: { color: colors.dim, fontFamily: fonts.mono, fontSize: 9.5 },
  resultsCard: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 6, overflow: "hidden" },
  resultRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12 },
  resultDivider: { borderTopWidth: 1, borderTopColor: colors.line },
  resultTitle: { color: colors.cream, fontFamily: fonts.body, fontSize: 14, flexShrink: 1 },
  resultYear: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11 },
  plus: { color: colors.amber, fontFamily: fonts.monoSemi, fontSize: 16, paddingLeft: 10 },
  removeBadge: {
    position: "absolute",
    right: 4,
    top: 4,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "rgba(23,18,16,0.9)",
    borderRadius: 999,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: { color: colors.ticket, fontFamily: fonts.mono, fontSize: 11 },
  more: { alignSelf: "center", borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16 },
  moreText: { color: colors.amber, fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase" },
});
