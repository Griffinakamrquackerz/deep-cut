import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import ProjectionistCard, { type TasteStats } from "@/components/ProjectionistCard";
import { primaryRatingLabel } from "@/components/RatingLine";
import Shrine from "@/components/Shrine";
import TonightStatus, { type TonightCard } from "@/components/TonightStatus";
import Turntable from "@/components/Turntable";
import { Eyebrow, MarqueeBulbs, Poster } from "@/components/ui";
import { api } from "@/lib/api";
import type { SearchHit } from "@/lib/types";
import { colors, fonts, profilePalette, type ProfilePalette } from "@/lib/theme";

// The member card — the single source of truth for how a profile looks, native
// port of the web ProfileView. Both the You tab (your own key) and /u/[key]
// (someone else's) render this, so your tab is exactly what everyone else sees.
// Theme, signature shrine + theme music, taste stats, threads, loved films,
// recent watches, mixtapes, and role-specific controls (edit vs. follow/report).

const REACTION_LABEL: Record<string, string> = {
  loved: "loved",
  fine: "thought it was fine",
  not_for_me: "bounced off",
  loved_ironically: "ironically loved",
};

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

interface ProfileData {
  person: { id: string; handle: string | null; display_name: string | null; avatar_url: string | null };
  theme: string;
  themeMusic: { kind: "track" | "album"; id: string } | null;
  signature: { id: number; title: string; year: number | null; posterPath: string | null; stills: string[] } | null;
  stats: TasteStats;
  threads: Array<{ title: string; line: string }>;
  lovedMovies: MovieLite[];
  watches: Array<{ id: string; reaction: string; note: string | null; movies: { id: number; title: string; year: number | null } | null }>;
  playlists: Array<{ id: string; name: string; share_slug: string; itemCount: number; isPublic: boolean }>;
  followerCount: number;
  followingCount: number;
  /** Their live "watching tonight" plan, if they have one up. */
  tonight?: TonightCard | null;
  isMe: boolean;
  iFollow: boolean;
}

function Avatar({ url, name, size = 56, accent }: { url?: string | null; name: string; size?: number; accent: string }) {
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: accent }}
        contentFit="cover"
        transition={150}
      />
    );
  }
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, borderColor: accent }]}>
      <Text style={[styles.avatarInitial, { color: accent }]}>
        {name.replace(/^@/, "").charAt(0).toUpperCase() || "?"}
      </Text>
    </View>
  );
}

export default function ProfileScreen({
  profileKey,
  footer,
  standalone = false,
}: {
  profileKey: string;
  footer?: React.ReactNode;
  /** Pushed as its own screen (/u/[key]) rather than rendered in the You tab,
   *  so it needs the way out and the house nav that the tab bar provides. */
  standalone?: boolean;
}) {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [lovedShown, setLovedShown] = useState(12);
  const [watchesShown, setWatchesShown] = useState(8);
  // Editable loved films (own profile only). Kept in local state so add/remove
  // feel instant; the backend is updated in the background.
  const [lovedList, setLovedList] = useState<MovieLite[]>([]);
  const [addingLoved, setAddingLoved] = useState(false);
  const [lovedQuery, setLovedQuery] = useState("");
  const [lovedResults, setLovedResults] = useState<SearchHit[]>([]);
  const lovedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const res = await api<ProfileData>(`/api/profile/${profileKey}`);
    if (res.ok && res.data) {
      setData(res.data);
      setFollowing(res.data.iFollow);
      setLovedList(res.data.lovedMovies);
    }
    setLoading(false);
  }, [profileKey]);

  function searchLoved(q: string) {
    setLovedQuery(q);
    if (lovedTimer.current) clearTimeout(lovedTimer.current);
    if (!q.trim()) {
      setLovedResults([]);
      return;
    }
    lovedTimer.current = setTimeout(async () => {
      const res = await api<{ results: SearchHit[] }>(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok && res.data) setLovedResults((res.data.results ?? []).slice(0, 6));
    }, 300);
  }

  async function addLoved(hit: SearchHit) {
    setLovedQuery("");
    setLovedResults([]);
    void Haptics.selectionAsync();
    if (!lovedList.some((m) => m.id === hit.id)) {
      // Optimistic — drop it on the shelf now; the poster fills in on reload.
      setLovedList((prev) => [
        { id: hit.id, title: hit.title, year: hit.year, poster_path: hit.poster_path ?? null, genres: [] },
        ...prev,
      ]);
    }
    await api("/api/loved", { method: "POST", body: JSON.stringify({ movieId: hit.id }) });
    void load();
  }

  async function removeLoved(movieId: number) {
    void Haptics.selectionAsync();
    setLovedList((prev) => prev.filter((m) => m.id !== movieId)); // optimistic
    await api("/api/loved", { method: "DELETE", body: JSON.stringify({ movieId }) });
  }

  // Reload on focus so edits made in Settings show the moment you return.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function toggleFollow() {
    if (!data || followBusy) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFollowBusy(true);
    const next = !following;
    setFollowing(next);
    const res = await api("/api/follows", {
      method: next ? "POST" : "DELETE",
      body: JSON.stringify({ userId: data.person.id }),
    });
    if (!res.ok) setFollowing(!next);
    setFollowBusy(false);
  }

  function reportUser() {
    if (!data) return;
    const REASONS = ["Impersonation", "Harassment or hate", "Spam or scam", "Inappropriate content", "Something else"];
    Alert.alert("Report this member", "What's going on?", [
      ...REASONS.map((reason) => ({
        text: reason,
        onPress: () => {
          void api("/api/safety", {
            method: "POST",
            body: JSON.stringify({ action: "report", subjectType: "user", subjectId: data.person.id, reason }),
          });
          Alert.alert("Report filed with the house 🛡");
        },
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  }

  function blockUser() {
    if (!data) return;
    const name = data.person.display_name ?? (data.person.handle ? `@${data.person.handle}` : "this member");
    Alert.alert("Block " + name + "?", "They'll disappear from your marquee and searches.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block",
        style: "destructive",
        onPress: async () => {
          const res = await api("/api/safety", {
            method: "POST",
            body: JSON.stringify({ action: "block", targetId: data.person.id, blocked: true }),
          });
          if (res.ok) router.back();
        },
      },
    ]);
  }

  const palette: ProfilePalette = profilePalette(data?.theme);

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={colors.amber} />
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
          <Text style={styles.dim}>No member by that name. They may have left the theater.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { person } = data;
  const name = person.display_name ?? (person.handle ? `@${person.handle}` : "A film person");
  const loved = data.isMe ? lovedList : data.lovedMovies;
  const watches = data.watches;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.body}>
        {standalone && <BackButton style={{ marginBottom: 12 }} />}
        {/* Header */}
        <View>
          <MarqueeBulbs />
          <Eyebrow style={{ marginTop: 8 }}>Member card</Eyebrow>
          <View style={styles.headerRow}>
            <View style={styles.idRow}>
              <Avatar url={person.avatar_url} name={name} accent={palette.amber} />
              <View style={{ minWidth: 0, flexShrink: 1 }}>
                <Text style={[styles.name, { color: palette.amber, textShadowColor: palette.amber }]}>
                  {name.toUpperCase()}
                </Text>
                {person.handle && person.display_name ? (
                  <Text style={styles.handle}>@{person.handle}</Text>
                ) : null}
                <Text style={styles.follows}>
                  {data.followerCount} follower{data.followerCount === 1 ? "" : "s"} · following{" "}
                  {data.followingCount}
                </Text>
              </View>
            </View>
            {data.isMe ? (
              <Pressable style={styles.styleBtn} onPress={() => router.push("/(tabs)/settings")}>
                <Text style={styles.styleBtnText}>Style it ✨</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => void toggleFollow()}
                disabled={followBusy}
                style={[
                  styles.followBtn,
                  following ? { borderColor: colors.line } : { borderColor: palette.ticket },
                  followBusy && { opacity: 0.5 },
                ]}
              >
                <Text style={[styles.followText, { color: following ? colors.dim : palette.ticket }]}>
                  {following ? "following ✓" : "+ follow"}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* What they're putting on tonight */}
        <TonightStatus
          initial={data.tonight ?? null}
          editable={data.isMe}
          name={person.handle ? `@${person.handle}` : (person.display_name ?? "They")}
          accent={palette.amber}
        />

        {/* Signature shrine */}
        {data.signature && (
          <Shrine
            movieId={data.signature.id}
            title={data.signature.title}
            year={data.signature.year}
            stills={data.signature.stills}
            posterPath={data.signature.posterPath}
          />
        )}

        {/* Theme music — a spinning-vinyl turntable over Spotify's player */}
        {data.themeMusic && (
          <View>
            <Eyebrow style={{ marginBottom: 8 }}>Now spinning</Eyebrow>
            <Turntable
              kind={data.themeMusic.kind}
              id={data.themeMusic.id}
              artPath={data.signature?.posterPath ?? null}
            />
          </View>
        )}

        {/* Taste stats */}
        <ProjectionistCard stats={data.stats} isMe={data.isMe} accent={palette.amber} />

        {/* Threads */}
        {data.threads.length > 0 && (
          <View style={styles.ticketCard}>
            <Eyebrow style={{ marginBottom: 8 }}>{data.isMe ? "Your taste" : "Their taste"}</Eyebrow>
            <View style={{ gap: 12 }}>
              {data.threads.map((t) => (
                <View key={t.title}>
                  <Text style={[styles.threadTitle, { color: palette.ticket }]}>{t.title}</Text>
                  <Text style={styles.threadLine}>{t.line}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Loved films — editable on your own card */}
        {(data.isMe || loved.length > 0) && (
          <View>
            <View style={styles.lovedHeader}>
              <Eyebrow>
                {data.isMe ? "Films you love" : "Films they love"} ({loved.length})
              </Eyebrow>
              {data.isMe && (
                <Pressable onPress={() => setAddingLoved((v) => !v)} hitSlop={8}>
                  <Text style={styles.addLoved}>{addingLoved ? "Done" : "＋ Add"}</Text>
                </Pressable>
              )}
            </View>

            {data.isMe && addingLoved && (
              <View style={{ marginBottom: 10 }}>
                <TextInput
                  value={lovedQuery}
                  onChangeText={searchLoved}
                  placeholder="Search any film to add…"
                  placeholderTextColor="rgba(183,164,145,0.6)"
                  autoCorrect={false}
                  style={styles.lovedSearch}
                />
                {lovedResults.length > 0 && (
                  <View style={styles.resultsCard}>
                    {lovedResults.map((r, i) => (
                      <Pressable
                        key={r.id}
                        onPress={() => void addLoved(r)}
                        style={[styles.resultRow, i > 0 && styles.resultDivider]}
                      >
                        <Text style={styles.resultTitle} numberOfLines={1}>
                          {r.title} <Text style={styles.resultYear}>{r.year ?? ""}</Text>
                        </Text>
                        <Text style={styles.resultPlus}>＋</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}

            {loved.length === 0 ? (
              <Text style={styles.dim}>
                No loved films yet — tap ＋ Add to start your shelf.
              </Text>
            ) : (
              <View style={styles.grid}>
                {loved.slice(0, lovedShown).map((m) => (
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
                    {data.isMe && (
                      <Pressable style={styles.removeBadge} onPress={() => void removeLoved(m.id)} hitSlop={8}>
                        <Text style={styles.removeText}>✕</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            )}
            {loved.length > lovedShown && (
              <Pressable style={styles.more} onPress={() => setLovedShown((n) => n + 24)}>
                <Text style={styles.moreText}>Roll more posters ↓</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Recent watches */}
        <View>
          <Eyebrow style={{ marginBottom: 8 }}>Recent watches</Eyebrow>
          {watches.length === 0 ? (
            <Text style={styles.dim}>Nothing logged yet.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {watches.slice(0, watchesShown).map((w) => {
                const m = w.movies;
                if (!m) return null;
                return (
                  <View key={w.id} style={styles.watchCard}>
                    <Text style={styles.watchText}>
                      <Text style={{ color: colors.dim }}>{REACTION_LABEL[w.reaction] ?? w.reaction} </Text>
                      <Text style={styles.watchTitle} onPress={() => router.push(`/m/${m.id}`)}>
                        {m.title}
                      </Text>{" "}
                      <Text style={styles.watchYear}>{m.year ?? ""}</Text>
                    </Text>
                    {w.note ? <Text style={styles.watchNote}>“{w.note}”</Text> : null}
                  </View>
                );
              })}
              {watches.length > watchesShown && (
                <Pressable style={styles.more} onPress={() => setWatchesShown((n) => n + 16)}>
                  <Text style={styles.moreText}>Roll more watches ↓</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        {/* Mixtapes */}
        {data.playlists.length > 0 && (
          <View>
            <Eyebrow style={{ marginBottom: 8 }}>
              {data.isMe ? "Mixtapes you sealed" : "Mixtapes they sealed"}
            </Eyebrow>
            <View style={{ gap: 8 }}>
              {data.playlists.map((p) => (
                <Pressable key={p.id} style={styles.tapeRow} onPress={() => router.push(`/p/${p.share_slug}`)}>
                  <View style={styles.tapeName}>
                    <Text style={styles.tapeTitle} numberOfLines={1}>
                      {p.name}
                    </Text>
                    {data.isMe && !p.isPublic && (
                      <View style={styles.privateBadge}>
                        <Text style={styles.privateBadgeText}>🔒 Private</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.tapeCount}>{p.itemCount} films ↗</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Safety */}
        {!data.isMe && (
          <View style={styles.safetyRow}>
            <Pressable onPress={reportUser}>
              <Text style={styles.safetyText}>⚑ Report</Text>
            </Pressable>
            <Pressable onPress={blockUser}>
              <Text style={styles.safetyText}>🚫 Block</Text>
            </Pressable>
          </View>
        )}

        {/* Your booth — management tools, only on your own tab */}
        {data.isMe && footer}
      </ScrollView>
      {standalone && <HouseNav />}
    </SafeAreaView>
  );
}

const GRID_W = 78;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 20, paddingBottom: 112, gap: 18 },
  dim: { color: colors.dim, fontFamily: fonts.body, fontSize: 14 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginTop: 2 },
  idRow: { flexDirection: "row", alignItems: "center", gap: 12, flexShrink: 1, minWidth: 0 },
  avatar: { borderWidth: 2, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  avatarInitial: { fontFamily: fonts.display, fontSize: 26 },
  name: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: 1,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  handle: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11 },
  follows: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10, marginTop: 3 },
  styleBtn: { borderWidth: 1, borderColor: colors.line, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 12 },
  styleBtnText: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase" },
  followBtn: { borderWidth: 1, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 14 },
  followText: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },
  ticketCard: {
    borderWidth: 1,
    borderColor: colors.ticket,
    borderStyle: "dashed",
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 16,
  },
  threadTitle: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" },
  threadLine: { color: colors.cream, fontFamily: fonts.body, fontSize: 14, marginTop: 2, lineHeight: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  gridItem: { position: "relative" },
  more: { alignSelf: "center", marginTop: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16 },
  moreText: { color: colors.amber, fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase" },
  lovedHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  addLoved: { color: colors.amber, fontFamily: fonts.mono, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  lovedSearch: {
    borderWidth: 1,
    borderColor: "rgba(255,180,84,0.6)",
    backgroundColor: colors.surface,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: colors.cream,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  resultsCard: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 6, overflow: "hidden", marginTop: 6 },
  resultRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12 },
  resultDivider: { borderTopWidth: 1, borderTopColor: colors.line },
  resultTitle: { color: colors.cream, fontFamily: fonts.body, fontSize: 14, flexShrink: 1 },
  resultYear: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11 },
  resultPlus: { color: colors.amber, fontFamily: fonts.monoSemi, fontSize: 16, paddingLeft: 10 },
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
  watchCard: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 6, padding: 12 },
  watchText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  watchTitle: { color: colors.cream, textDecorationLine: "underline" },
  watchYear: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11 },
  watchNote: { color: "rgba(243,233,215,0.8)", fontFamily: fonts.bodyItalic, fontSize: 12, marginTop: 4 },
  tapeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 6,
    padding: 12,
  },
  tapeName: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1, minWidth: 0 },
  tapeTitle: { color: colors.cream, fontFamily: fonts.display, fontSize: 18, letterSpacing: 0.5, flexShrink: 1 },
  privateBadge: { borderWidth: 1, borderColor: colors.line, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2 },
  privateBadgeText: { color: colors.dim, fontFamily: fonts.mono, fontSize: 7.5, letterSpacing: 1.5, textTransform: "uppercase" },
  tapeCount: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10 },
  safetyRow: { flexDirection: "row", justifyContent: "center", gap: 24, marginTop: 8 },
  safetyText: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1 },
});
