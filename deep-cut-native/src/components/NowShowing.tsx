import { Image } from "expo-image";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { api } from "@/lib/api";
import { colors, fonts, mono } from "@/lib/theme";
import { useUsherTarget } from "@/lib/usher";

// Now Showing — the television, cropped out of the basement photograph and set
// on Tonight where the morning-after card used to sit.
//
// It is the same image and the same measurements as the room itself: the crop
// rectangle comes from the server, and where the screen falls inside that crop
// is derived from the room's screen rectangle rather than stored twice. Tune
// one and the other follows.
//
// The set changes channel on its own every few seconds. A static poster would
// have said "there are short films in here"; a television flipping through them
// says it while showing you three of them.

const FLIP_MS = 4200;

interface Short {
  id: string;
  title: string;
  director: string;
  year: number;
  runtimeSec: number;
  channels: string[];
  pedigree: string;
  thumb: string;
}
interface Scene {
  image: string | null;
  screen: { x: number; y: number; w: number; h: number };
  card: { x: number; y: number; w: number; h: number };
}
interface Channel {
  key: string;
  glyph: string;
  label: string;
}

export default function NowShowing() {
  const [films, setFilms] = useState<Short[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [scene, setScene] = useState<Scene | null>(null);
  const [at, setAt] = useState(0);
  const [broken, setBroken] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const reduced = useReducedMotion();
  // The studio tour used to spotlight the theatre's door further down the
  // page. The door is gone, so the beat lands here — a beat whose target has
  // vanished waits three seconds before giving up on it.
  const tvRef = useUsherTarget("tv");

  useEffect(() => {
    void api<{ films: Short[]; channels: Channel[]; scene: Scene }>("/api/shorts").then((res) => {
      if (!res.ok || !res.data) return;
      setFilms(res.data.films ?? []);
      setChannels(res.data.channels ?? []);
      setScene(res.data.scene ?? null);
    });
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  useEffect(() => {
    // Reduced motion gets one film and no flipping — the rotation is flavour,
    // and flavour is never worth making someone feel unwell.
    if (reduced || films.length < 2) return;
    timer.current = setInterval(() => setAt((i) => (i + 1) % films.length), FLIP_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [reduced, films.length]);

  const film = films[at] ?? null;

  // The screen's place inside the crop, derived from the room's own numbers.
  const inCard = useMemo(() => {
    if (!scene) return null;
    const { screen: sc, card } = scene;
    return {
      x: (sc.x - card.x) / card.w,
      y: (sc.y - card.y) / card.h,
      w: sc.w / card.w,
      h: sc.h / card.h,
    };
  }, [scene]);

  if (!film || !scene?.image || !inCard || broken) return null;

  const ch = channels.find((c) => film.channels.includes(c.key));
  const chNo = ch ? String(channels.indexOf(ch) + 1).padStart(2, "0") : "01";

  // Crop by oversizing the photograph and sliding it — the box shows the
  // television and nothing else.
  const BOX = 104;
  const full = { w: BOX / scene.card.w, h: BOX / scene.card.h };

  return (
    <Pressable
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push("/tv");
      }}
      ref={tvRef}
      collapsable={false}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`Now showing ${film.title}. Open Deep Cut Theatre.`}
    >
      <Text style={styles.eyebrow}>
        📺 NOW SHOWING · CH {chNo} {ch ? ch.label.toUpperCase() : ""}
      </Text>

      <View style={styles.row}>
        <View style={[styles.tv, { width: BOX, height: BOX }]}>
          <Image
            source={{ uri: scene.image }}
            style={{
              position: "absolute",
              width: full.w,
              height: full.h,
              left: -full.w * scene.card.x,
              top: -full.h * scene.card.y,
            }}
            contentFit="fill"
            onError={() => setBroken(true)}
          />
          {/* The film's own frame, over the photograph's blue screen. */}
          <Animated.View
            key={film.id}
            entering={reduced ? undefined : FadeIn.duration(420)}
            style={{
              position: "absolute",
              left: BOX * inCard.x,
              top: BOX * inCard.y,
              width: BOX * inCard.w,
              height: BOX * inCard.h,
              overflow: "hidden",
              backgroundColor: "#04050a",
            }}
          >
            <Image source={{ uri: film.thumb }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <View pointerEvents="none" style={styles.scan}>
              {Array.from({ length: 14 }).map((_, i) => (
                <View key={i} style={styles.scanline} />
              ))}
            </View>
          </Animated.View>
        </View>

        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={2}>
            {film.title.toUpperCase()}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {film.director} · {film.year} · {Math.round(film.runtimeSec / 60)} MIN
          </Text>
          <Text style={styles.pedigree} numberOfLines={2}>
            🏆 {film.pedigree}
          </Text>
          <Text style={styles.cta}>Pull up a beanbag →</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  eyebrow: { color: colors.amber, fontFamily: mono, fontSize: 10, letterSpacing: 1.5 },
  row: { flexDirection: "row", gap: 12 },
  tv: { borderRadius: 6, overflow: "hidden", backgroundColor: "#100c09" },
  scan: { ...StyleSheet.absoluteFill, justifyContent: "space-between" },
  scanline: { height: 1, backgroundColor: "rgba(0,0,0,0.28)" },
  meta: { flex: 1, minWidth: 0, justifyContent: "center", gap: 3 },
  title: { color: colors.cream, fontFamily: fonts.display, fontSize: 22, lineHeight: 23 },
  sub: { color: colors.dim, fontFamily: mono, fontSize: 10 },
  pedigree: { color: colors.avail, fontFamily: mono, fontSize: 9, lineHeight: 14 },
  cta: { color: colors.ticket, fontFamily: mono, fontSize: 10, letterSpacing: 1, marginTop: 3 },
});
