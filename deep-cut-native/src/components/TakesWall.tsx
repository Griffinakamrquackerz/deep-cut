import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import MentionInput, { MentionText } from "@/components/MentionInput";
import { api } from "@/lib/api";
import { colors, fonts, mono } from "@/lib/theme";
import type { SearchHit } from "@/lib/types";
import { Button, Poster } from "./ui";

// The Hot Takes wall — native port of the web HotTakesWall: 250 characters of
// nitrate-burning opinion pinned to a film. 🔥 to agree, 🥊 to demand pistols
// at dawn, 💬 to banter. Same copy, same limits, same report/block safety.

const TAKE_MAX = 250;

interface Take {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; handle: string | null; displayName: string | null; avatarUrl: string | null };
  movie: { id: number; title: string; year: number | null; posterPath: string | null } | null;
  fires: number;
  fights: number;
  myReaction: "fire" | "fight" | null;
  mine: boolean;
  comments: number;
}

interface Banter {
  id: string;
  body: string;
  /** Handles in the body that resolved to real people — only these link. */
  mentions?: string[];
  createdAt: string;
  author: { id: string; handle: string | null; displayName: string | null; avatarUrl: string | null };
  mine: boolean;
}

function ago(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

const authorName = (a: Take["author"]) => (a.handle ? `@${a.handle}` : (a.displayName ?? "someone"));

export default function TakesWall({ movieId, movieTitle }: { movieId?: number; movieTitle?: string }) {
  const [takes, setTakes] = useState<Take[] | null>(null);
  const [body, setBody] = useState("");
  const [film, setFilm] = useState<SearchHit | null>(
    movieId ? { id: movieId, title: movieTitle ?? "this film", year: null } : null,
  );
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Banter threads: which take is open, its loaded comments, and the draft.
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, Banter[] | undefined>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const qs = movieId ? `?movieId=${movieId}` : "";
    const r = await api<{ takes: Take[] }>(`/api/takes${qs}`);
    setTakes(r.data?.takes ?? []);
  }, [movieId]);

  useEffect(() => {
    void load();
  }, [load]);

  function say(text: string) {
    setNotice(text);
    setTimeout(() => setNotice(null), 3000);
  }

  // Film search for the composer (skipped when pinned to a movie page).
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    debounce.current = setTimeout(() => {
      api<{ results: SearchHit[] }>(`/api/search?q=${encodeURIComponent(q)}`).then((r) =>
        setHits((r.data?.results ?? []).slice(0, 6)),
      );
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  async function post() {
    if (!film || body.trim().length < 2 || posting) return;
    setPosting(true);
    const res = await api("/api/takes", {
      method: "POST",
      body: JSON.stringify({ movieId: film.id, body: body.trim() }),
    });
    setPosting(false);
    if (res.status === 429) return say("15 takes a day — let the nitrate cool off. 🔥");
    if (!res.ok) return say("The wall rejected that one — try again. ✕");
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    say("Posted. The nitrate is lit. 🔥");
    setBody("");
    if (!movieId) setFilm(null);
    setQuery("");
    void load();
  }

  async function react(t: Take, kind: "fire" | "fight") {
    const next = t.myReaction === kind ? null : kind;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTakes((prev) =>
      (prev ?? []).map((x) => {
        if (x.id !== t.id) return x;
        const fires = x.fires + (next === "fire" ? 1 : 0) - (x.myReaction === "fire" ? 1 : 0);
        const fights = x.fights + (next === "fight" ? 1 : 0) - (x.myReaction === "fight" ? 1 : 0);
        return { ...x, fires, fights, myReaction: next };
      }),
    );
    await api("/api/takes/react", {
      method: "POST",
      body: JSON.stringify({ takeId: t.id, kind: next }),
    });
  }

  async function toggleThread(t: Take) {
    if (openThread === t.id) return setOpenThread(null);
    setOpenThread(t.id);
    setDraft("");
    if (!threads[t.id]) {
      const r = await api<{ comments: Banter[] }>(`/api/takes/comments?takeId=${t.id}`);
      setThreads((prev) => ({ ...prev, [t.id]: r.data?.comments ?? [] }));
    }
  }

  async function sendBanter(t: Take) {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    const res = await api("/api/takes/comments", {
      method: "POST",
      body: JSON.stringify({ takeId: t.id, body: text }),
    });
    setSending(false);
    if (res.status === 429) return say("The banter well refills tomorrow. 💬");
    if (!res.ok) return;
    setDraft("");
    const r = await api<{ comments: Banter[] }>(`/api/takes/comments?takeId=${t.id}`);
    setThreads((prev) => ({ ...prev, [t.id]: r.data?.comments ?? [] }));
    setTakes((prev) => (prev ?? []).map((x) => (x.id === t.id ? { ...x, comments: x.comments + 1 } : x)));
  }

  async function removeBanter(t: Take, c: Banter) {
    setThreads((prev) => ({ ...prev, [t.id]: (prev[t.id] ?? []).filter((x) => x.id !== c.id) }));
    setTakes((prev) =>
      (prev ?? []).map((x) => (x.id === t.id ? { ...x, comments: Math.max(0, x.comments - 1) } : x)),
    );
    await api(`/api/takes/comments?id=${c.id}`, { method: "DELETE" });
  }

  async function remove(t: Take) {
    setTakes((prev) => (prev ?? []).filter((x) => x.id !== t.id));
    await api(`/api/takes?id=${t.id}`, { method: "DELETE" });
  }

  function report(subjectType: "hot_take" | "take_comment", subjectId: string) {
    const file = async (reason: string) => {
      await api("/api/safety", {
        method: "POST",
        body: JSON.stringify({ action: "report", subjectType, subjectId, reason }),
      });
      say("Reported — we'll review it. 🚩");
    };
    if (Platform.OS === "ios") {
      // iOS gets a free-text reason; Android's Alert has no prompt variant.
      Alert.prompt("Report this", "What's the problem? (spam, harassment, hateful…)", (reason) => {
        if (reason?.trim()) void file(reason.trim());
      });
    } else {
      Alert.alert("Report this?", "It will be flagged for review.", [
        { text: "Cancel", style: "cancel" },
        { text: "Report", style: "destructive", onPress: () => void file("reported from app") },
      ]);
    }
  }

  function blockAuthor(authorId: string) {
    Alert.alert("Block this person?", "You won't see their takes or banter anymore.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block",
        style: "destructive",
        onPress: async () => {
          const res = await api("/api/safety", {
            method: "POST",
            body: JSON.stringify({ action: "block", targetId: authorId, blocked: true }),
          });
          if (res.ok) {
            say("Blocked. Their takes are gone. 🚫");
            void load();
          }
        },
      },
    ]);
  }

  return (
    <View style={{ gap: 12 }}>
      {notice && <Text style={styles.notice}>{notice}</Text>}

      {/* Composer */}
      <View style={styles.composer}>
        {!movieId &&
          (film ? (
            <Pressable onPress={() => setFilm(null)}>
              <Text style={styles.filmPick}>
                🎬 {film.title} {film.year ?? ""} <Text style={{ color: colors.dim }}>✕</Text>
              </Text>
            </Pressable>
          ) : (
            <>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Which film is catching strays?"
                placeholderTextColor={colors.dim}
                style={styles.input}
              />
              {hits.map((h) => (
                <Pressable
                  key={h.id}
                  onPress={() => {
                    setFilm(h);
                    setQuery("");
                    setHits([]);
                  }}
                  style={styles.hit}
                >
                  <Text style={styles.hitText}>
                    {h.title} <Text style={{ color: colors.dim }}>{h.year ?? ""}</Text>
                  </Text>
                </Pressable>
              ))}
            </>
          ))}
        <TextInput
          value={body}
          onChangeText={(t) => setBody(t.slice(0, TAKE_MAX))}
          placeholder="250 characters, no mercy…"
          placeholderTextColor={colors.dim}
          multiline
          style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
        />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={styles.counter}>{TAKE_MAX - body.length}</Text>
          <View style={{ flex: 1 }}>
            <Button
              title={posting ? "Lighting it…" : "🔥 Post the take"}
              size="sm"
              disabled={!film || body.trim().length < 2}
              busy={posting}
              onPress={() => void post()}
            />
          </View>
        </View>
      </View>

      {/* The wall */}
      {takes === null ? (
        <Text style={styles.dimLine}>warming up the wall…</Text>
      ) : takes.length === 0 ? (
        <Text style={styles.dimLine}>No takes yet — first spark lights the wall.</Text>
      ) : (
        takes.map((t) => {
          const scorching = t.fires >= 3;
          return (
            <View key={t.id} style={styles.card}>
              {scorching && <Text style={styles.scorching}>SCORCHING</Text>}
              <View style={{ flexDirection: "row", gap: 10 }}>
                {t.movie?.posterPath ? (
                  <Poster path={t.movie.posterPath} title={t.movie.title} year={t.movie.year} width={44} />
                ) : null}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.byline}>
                    <Text style={{ color: colors.amber }}>{authorName(t.author)}</Text> on{" "}
                    <Text style={{ color: colors.cream }}>
                      {t.movie ? `${t.movie.title} ${t.movie.year ?? ""}` : "a film"}
                    </Text>{" "}
                    · {ago(t.createdAt)}
                  </Text>
                  <Text style={styles.takeBody}>“{t.body}”</Text>
                </View>
              </View>
              <View style={styles.actions}>
                <Pressable onPress={() => void react(t, "fire")} style={[styles.pill, t.myReaction === "fire" && styles.pillFire]}>
                  <Text style={[styles.pillText, t.myReaction === "fire" && { color: colors.ticket }]}>🔥 {t.fires}</Text>
                </Pressable>
                <Pressable onPress={() => void react(t, "fight")} style={[styles.pill, t.myReaction === "fight" && styles.pillFight]}>
                  <Text style={[styles.pillText, t.myReaction === "fight" && { color: colors.amber }]}>
                    🥊 fight me {t.fights > 0 ? t.fights : ""}
                  </Text>
                </Pressable>
                <Pressable onPress={() => void toggleThread(t)} style={styles.pill}>
                  <Text style={styles.pillText}>💬 {t.comments > 0 ? t.comments : "banter"}</Text>
                </Pressable>
                <View style={{ flex: 1 }} />
                {t.mine ? (
                  <Pressable onPress={() => void remove(t)}>
                    <Text style={styles.linkDim}>tear down</Text>
                  </Pressable>
                ) : (
                  <>
                    <Pressable onPress={() => report("hot_take", t.id)}>
                      <Text style={styles.linkDim}>⚑</Text>
                    </Pressable>
                    <Pressable onPress={() => blockAuthor(t.author.id)}>
                      <Text style={styles.linkDim}>block</Text>
                    </Pressable>
                  </>
                )}
              </View>

              {/* The banter thread */}
              {openThread === t.id && (
                <View style={styles.thread}>
                  {threads[t.id] === undefined ? (
                    <Text style={styles.dimLine}>pulling up chairs…</Text>
                  ) : (threads[t.id] ?? []).length === 0 ? (
                    <Text style={styles.dimLine}>no banter yet — first heckle wins.</Text>
                  ) : (
                    (threads[t.id] ?? []).map((c) => (
                      <View key={c.id} style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.byline}>
                            <Text style={{ color: colors.amber }}>{authorName(c.author)}</Text> · {ago(c.createdAt)}
                          </Text>
                          <MentionText
                            body={c.body}
                            mentions={c.mentions ?? []}
                            style={styles.banterBody}
                            onPressHandle={(h) => router.push(`/u/${h}`)}
                          />
                        </View>
                        {c.mine ? (
                          <Pressable onPress={() => void removeBanter(t, c)} hitSlop={8}>
                            <Text style={styles.linkDim}>✕</Text>
                          </Pressable>
                        ) : (
                          <Pressable onPress={() => report("take_comment", c.id)} hitSlop={8}>
                            <Text style={styles.linkDim}>⚑</Text>
                          </Pressable>
                        )}
                      </View>
                    ))
                  )}
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <MentionInput
                      value={draft}
                      onChange={setDraft}
                      maxLength={TAKE_MAX}
                      placeholder="Talk your talk… @ to tag"
                      style={[styles.input, { paddingVertical: 8 }]}
                    />
                    <Pressable
                      onPress={() => void sendBanter(t)}
                      disabled={!draft.trim() || sending}
                      style={[styles.pill, { opacity: draft.trim() ? 1 : 0.4 }]}
                    >
                      <Text style={styles.pillText}>{sending ? "…" : "🎤"}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { color: colors.amber, fontFamily: mono, fontSize: 12, textAlign: "center" },
  composer: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    backgroundColor: colors.bg,
    color: colors.cream,
    padding: 10,
    fontFamily: fonts.body,
  },
  filmPick: { color: colors.amber, fontFamily: mono, fontSize: 13 },
  hit: { paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.line },
  hitText: { color: colors.cream, fontFamily: fonts.body, fontSize: 14 },
  counter: { color: colors.dim, fontFamily: mono, fontSize: 11 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  scorching: {
    position: "absolute",
    right: 8,
    top: 8,
    color: colors.ticket,
    fontFamily: fonts.display,
    fontSize: 13,
    letterSpacing: 2,
    borderWidth: 1.5,
    borderColor: colors.ticket,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    transform: [{ rotate: "8deg" }],
    zIndex: 2,
  },
  byline: { color: colors.dim, fontFamily: mono, fontSize: 10.5 },
  takeBody: { color: colors.cream, fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, marginTop: 4 },
  banterBody: { color: colors.cream, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, marginTop: 2 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  pill: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  pillFire: { borderColor: colors.ticket, backgroundColor: "rgba(228,87,61,0.12)" },
  pillFight: { borderColor: colors.amber, backgroundColor: "rgba(255,180,84,0.12)" },
  pillText: { color: colors.dim, fontFamily: mono, fontSize: 11.5 },
  linkDim: { color: colors.dim, fontFamily: mono, fontSize: 11, textDecorationLine: "underline", paddingHorizontal: 4 },
  thread: { borderTopWidth: 1, borderColor: colors.line, paddingTop: 10, gap: 6 },
  dimLine: { color: colors.dim, fontFamily: mono, fontSize: 11.5 },
});
