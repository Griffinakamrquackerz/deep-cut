import * as Haptics from "expo-haptics";
import AdSlot from "@/components/AdSlot";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import YoutubePlayer from "react-native-youtube-iframe";
import { useAuth } from "./_layout";
import { api } from "@/lib/api";
import { colors, fonts, glowAmber, mono, posterUrl } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { VIBES, type Vibe } from "@/lib/types";
import { Image } from "expo-image";
import { Button, Eyebrow, Marquee, MarqueeBulbs } from "@/components/ui";

// Just Roll It — the lean-back channel, native. Pick a channel; trailers roll
// (45s segments, 12s for poster-only films) until one grabs you. Same pool,
// pacing, and embed behavior as the web RollChannel.

const TRAILER_SECONDS = 45;
const POSTER_SECONDS = 12;

interface ChannelFilm {
  id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  overview: string;
  canon?: boolean;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function Roll() {
  const router = useRouter();
  const { session } = useAuth();
  const { width } = useWindowDimensions();
  const [channel, setChannel] = useState<Vibe | null>(null);
  const [queue, setQueue] = useState<ChannelFilm[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [mineOnly, setMineOnly] = useState(false);
  const [hasServices, setHasServices] = useState(false);
  const [noted, setNoted] = useState(false);
  // Trailer keys by movie id: undefined = not fetched, null = none found.
  const [trailers, setTrailers] = useState<Record<number, string | null>>({});
  const trailersRef = useRef(trailers);
  trailersRef.current = trailers;

  const film = queue[idx] ?? null;
  const trailerKey = film ? trailers[film.id] : undefined;
  const limit = trailerKey ? TRAILER_SECONDS : POSTER_SECONDS;

  useEffect(() => {
    if (!session) return;
    supabase
      .from("user_services")
      .select("service")
      .eq("user_id", session.user.id)
      .then(({ data }) => setHasServices((data ?? []).length > 0));
  }, [session]);

  const fetchTrailer = useCallback(async (movieId: number) => {
    if (trailersRef.current[movieId] !== undefined) return;
    const r = await api<{ trailerKey: string | null }>(`/api/settle/film?id=${movieId}`);
    setTrailers((prev) => ({ ...prev, [movieId]: r.data?.trailerKey ?? null }));
  }, []);

  async function tune(v: Vibe) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setChannel(v);
    setLoading(true);
    setError(null);
    const res = await api<{ candidates?: ChannelFilm[] }>("/api/roll/pool", {
      method: "POST",
      body: JSON.stringify({
        vibe: v.key,
        // Random slice per tune-in — the channel shouldn't rerun last night's lineup.
        pageStart: 1 + Math.floor(Math.random() * 3),
        myServicesOnly: mineOnly,
      }),
    });
    const films = res.data?.candidates ?? [];
    if (!films.length) {
      setError(
        mineOnly
          ? "Nothing on your platforms here — try another channel."
          : "Static on that frequency — try another channel.",
      );
      setChannel(null);
      setLoading(false);
      return;
    }
    setQueue(shuffle(films));
    setIdx(0);
    setElapsed(0);
    setMuted(true);
    setNoted(false);
    setLoading(false);
  }

  const next = useCallback(() => {
    setIdx((i) => (i + 1) % Math.max(queue.length, 1));
    setElapsed(0);
    setMuted(true);
    setNoted(false);
  }, [queue.length]);

  // Rewind to the film you just skipped past. Clamps at the top of the reel.
  const prev = useCallback(() => {
    setIdx((i) => Math.max(0, i - 1));
    setElapsed(0);
    setMuted(true);
    setNoted(false);
  }, []);

  // Fetch the current + next trailers (prefetch keeps the channel seamless).
  useEffect(() => {
    if (!film) return;
    void fetchTrailer(film.id);
    const upNext = queue[(idx + 1) % queue.length];
    if (upNext) void fetchTrailer(upNext.id);
  }, [film, idx, queue, fetchTrailer]);

  // The channel clock: tick once a second, flip when the segment runs out.
  useEffect(() => {
    if (!film) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [film, idx]);
  useEffect(() => {
    if (film && elapsed >= limit) next();
  }, [elapsed, limit, film, next]);

  async function thatOne() {
    if (!film || noted) return;
    setNoted(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (session) {
      await api("/api/signals", {
        method: "POST",
        body: JSON.stringify({ movieId: film.id, source: "roll_pick" }),
      }).catch(() => null);
    }
  }

  const playerH = Math.round(((width - 40) * 9) / 16);
  const chNum = channel ? String(VIBES.findIndex((v) => v.key === channel.key) + 1).padStart(2, "0") : "00";

  // ── Channel guide ──────────────────────────────────────────────────
  if (!channel) {
    return (
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <MarqueeBulbs />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
            <View>
              <Eyebrow style={{ marginTop: 10 }}>Lean back</Eyebrow>
              <Marquee size={42}>JUST ROLL IT</Marquee>
            </View>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          <Text style={styles.lead}>Pick a channel. Trailers roll until one grabs you.</Text>
          {error && <Text style={styles.error}>{error}</Text>}
          {hasServices && (
            <Pressable onPress={() => setMineOnly((v) => !v)} style={styles.mineChip}>
              <Text style={{ color: mineOnly ? colors.amber : colors.dim, fontFamily: mono, fontSize: 12 }}>
                📺 {mineOnly ? "Only on my platforms ✓" : "Only on my platforms"}
              </Text>
            </Pressable>
          )}
          <View style={{ gap: 8, marginTop: 12 }}>
            {VIBES.map((v, i) => (
              <Pressable key={v.key} onPress={() => void tune(v)} disabled={loading} style={styles.chRow}>
                <Text style={styles.chNum}>CH {String(i + 1).padStart(2, "0")}</Text>
                <Text style={styles.chLabel}>
                  {v.emoji} {v.label}
                </Text>
                <Text style={styles.chGo}>{loading ? "…" : "▶"}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── The channel, on air ────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.screen}>
      <View style={{ padding: 20, flex: 1 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={styles.onAir}>
            CH {chNum} · {channel.emoji} {channel.label.toUpperCase()}
          </Text>
          <Pressable
            onPress={() => {
              setChannel(null);
              setQueue([]);
            }}
            hitSlop={12}
          >
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>

        {/* The screen */}
        <View style={[styles.tube, { height: playerH }]}>
          {film && trailerKey ? (
            <>
              <YoutubePlayer
                key={film.id}
                height={playerH}
                width={width - 40}
                play
                mute={muted}
                videoId={trailerKey}
                onError={() => setTrailers((prev) => ({ ...prev, [film.id]: null }))}
                initialPlayerParams={{ controls: false, modestbranding: true, rel: false }}
                webViewProps={{
                  allowsInlineMediaPlayback: true,
                  mediaPlaybackRequiresUserAction: false, // iOS: let it autoplay
                  scrollEnabled: false,
                  pointerEvents: "none",
                }}
              />
              {muted && (
                <Pressable style={styles.unmute} onPress={() => setMuted(false)}>
                  <Text style={styles.unmuteText}>🔊 TAP FOR SOUND</Text>
                </Pressable>
              )}
            </>
          ) : film ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              {film.poster_path ? (
                <Image
                  source={{ uri: posterUrl(film.poster_path, "w342") ?? undefined }}
                  style={{ width: playerH * (2 / 3) * 0.9, height: playerH * 0.9, borderRadius: 6 }}
                  contentFit="cover"
                />
              ) : (
                <Text style={styles.static}>◦◦ static ◦◦</Text>
              )}
            </View>
          ) : null}
          {/* Segment progress — the channel's pulse */}
          <View style={[styles.pulse, { width: `${Math.min(100, (elapsed / limit) * 100)}%` }]} />
        </View>

        {/* The plaque */}
        {film && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.filmTitle}>
              {film.title} <Text style={styles.filmYear}>{film.year ?? ""}</Text>
              {film.canon ? <Text style={styles.housePick}>  ★ HOUSE PICK</Text> : null}
            </Text>
            {!!film.overview && (
              <Text style={styles.overview} numberOfLines={2}>
                {film.overview}
              </Text>
            )}
            <Pressable onPress={() => router.push(`/m/${film.id}`)} hitSlop={8}>
              <Text style={styles.infoLink}>ⓘ Full info →</Text>
            </Pressable>
          </View>
        )}

        <View style={{ flex: 1 }} />
        <View style={{ gap: 8, paddingBottom: 8 }}>
          {noted ? (
            <Text style={styles.notedLine}>🎯 Noted.</Text>
          ) : (
            <Button title="🎯 That one" kind="outline" size="sm" onPress={() => void thatOne()} />
          )}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button title="◂ Back" kind="outline" onPress={prev} disabled={idx === 0} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Next →" onPress={next} />
            </View>
          </View>
        </View>

        <AdSlot index={2} style={{ marginHorizontal: 16, marginTop: 12 }} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  close: { color: colors.dim, fontSize: 22, padding: 4 },
  lead: { color: colors.cream, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, marginTop: 8 },
  error: { color: colors.ticket, fontFamily: mono, fontSize: 12, marginTop: 10 },
  mineChip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
    alignSelf: "flex-start",
    marginTop: 12,
  },
  chRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  chNum: { color: colors.dim, fontFamily: mono, fontSize: 11 },
  chLabel: { color: colors.cream, fontFamily: fonts.display, fontSize: 20, letterSpacing: 0.5, flex: 1 },
  chGo: { color: colors.amber, fontSize: 14 },
  onAir: { color: colors.amber, fontFamily: mono, fontSize: 12, letterSpacing: 2, ...glowAmber },
  tube: {
    marginTop: 12,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: colors.line,
  },
  unmute: {
    position: "absolute",
    bottom: 10,
    left: 10,
    backgroundColor: "rgba(23,18,16,0.85)",
    borderColor: "rgba(255,180,84,0.6)",
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  unmuteText: { color: colors.amber, fontFamily: mono, fontSize: 11, letterSpacing: 1 },
  static: { color: colors.dim, fontFamily: mono, fontSize: 14, letterSpacing: 3 },
  pulse: { position: "absolute", bottom: 0, left: 0, height: 3, backgroundColor: colors.ticket },
  filmTitle: { color: colors.cream, fontFamily: fonts.display, fontSize: 26, letterSpacing: 0.5 },
  filmYear: { color: colors.dim, fontFamily: fonts.mono, fontSize: 13 },
  housePick: { color: colors.amber, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1 },
  overview: { color: colors.dim, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: 4 },
  infoLink: { color: colors.amber, fontFamily: fonts.mono, fontSize: 11, marginTop: 8 },
  notedLine: { color: colors.avail, fontFamily: mono, fontSize: 12, textAlign: "center", paddingVertical: 10 },
});
