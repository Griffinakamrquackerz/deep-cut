import { Image } from "expo-image";
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { colors, fonts, posterUrl } from "@/lib/theme";

// The signature-film shrine — production stills scattered like photo prints
// taped to a bedroom wall. A faithful port of the web SignatureShrine +
// ShrinePrints: same slot layout, same seeded jitter, same swap cadence
// (first swap ~3s, then every 2.5s). expo-image's transition handles the
// crossfade; reduced motion freezes the wall.

interface Slot {
  left: number; // percentages of container width
  top: number;
  width: number;
  rotate: number;
  z: number;
}

const SLOTS: Slot[] = [
  { left: -5, top: 12, width: 40, rotate: -8, z: 3 },
  { left: 24, top: -10, width: 44, rotate: 5, z: 2 },
  { left: 52, top: 6, width: 42, rotate: -5, z: 4 },
  { left: 76, top: 40, width: 38, rotate: 8, z: 2 },
  { left: 6, top: 52, width: 38, rotate: 6, z: 5 },
  { left: 40, top: 46, width: 44, rotate: -7, z: 6 },
];

const FIRST_SWAP_MS = 3000;
const SWAP_EVERY_MS = 2500;

/** Small deterministic jitter so two shrines never look identical (web parity). */
function jitter(seed: number, i: number, range: number): number {
  const h = (seed * 2654435761 + i * 40503) >>> 0;
  return (h % (range * 2 + 1)) - range;
}

export default function Shrine({
  movieId,
  title,
  year,
  stills,
  posterPath,
}: {
  movieId: number;
  title: string;
  year: number | null;
  stills: string[];
  posterPath: string | null;
}) {
  const { width: screenW } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [slotPaths, setSlotPaths] = useState<string[]>(stills.slice(0, SLOTS.length));
  const poolCursor = useRef(Math.min(stills.length, SLOTS.length));
  const slotCursor = useRef(0);

  useEffect(() => {
    setSlotPaths(stills.slice(0, SLOTS.length));
    poolCursor.current = Math.min(stills.length, SLOTS.length);
    slotCursor.current = 0;
    if (stills.length <= SLOTS.length || reduced) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (!alive) return;
      const si = slotCursor.current % SLOTS.length;
      slotCursor.current++;
      const next = stills[poolCursor.current % stills.length];
      poolCursor.current++;
      setSlotPaths((prev) => prev.map((p, i) => (i === si ? next : p)));
      timer = setTimeout(tick, SWAP_EVERY_MS);
    };
    timer = setTimeout(tick, FIRST_SWAP_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [stills, reduced]);

  const containerW = screenW - 40; // screen padding
  const height = 190;
  const usePoster = stills.length < 2;

  return (
    <View style={[styles.wall, { height }]}>
      {usePoster ? (
        posterPath && (
          <View
            style={[
              styles.print,
              {
                left: containerW * 0.33,
                top: 20,
                width: containerW * 0.34,
                transform: [{ rotate: `${jitter(movieId, 1, 6)}deg` }],
              },
            ]}
          >
            <View style={styles.tape} />
            <Image
              source={{ uri: posterUrl(posterPath, "w342") ?? undefined }}
              style={{ width: "100%", aspectRatio: 2 / 3 }}
              contentFit="cover"
            />
          </View>
        )
      ) : (
        slotPaths.map((path, i) => {
          const slot = SLOTS[i];
          if (!slot || !path) return null;
          const w = (containerW * slot.width) / 100;
          return (
            <View
              key={i}
              style={[
                styles.print,
                {
                  left: (containerW * slot.left) / 100,
                  top: (height * slot.top) / 100,
                  width: w,
                  zIndex: slot.z,
                  transform: [{ rotate: `${slot.rotate + jitter(movieId, i, 3)}deg` }],
                },
              ]}
            >
              <View style={styles.tape} />
              <Image
                source={{ uri: posterUrl(path, "w342") ?? undefined }}
                style={{ width: "100%", aspectRatio: 16 / 9 }}
                contentFit="cover"
                transition={600}
              />
            </View>
          );
        })
      )}

      {/* The plaque */}
      <View style={styles.plaque}>
        <Text style={styles.plaqueKicker}>🎞 SIGNATURE FILM</Text>
        <Text style={styles.plaqueTitle}>
          {title} <Text style={styles.plaqueYear}>{year ?? ""}</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wall: {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  print: {
    position: "absolute",
    backgroundColor: "#fdf8ee",
    padding: 3,
    borderRadius: 2,
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  tape: {
    position: "absolute",
    top: -6,
    alignSelf: "center",
    width: 34,
    height: 12,
    backgroundColor: "rgba(243,233,215,0.45)",
    transform: [{ rotate: "-4deg" }],
    zIndex: 10,
  },
  plaque: {
    position: "absolute",
    left: 12,
    bottom: 10,
    zIndex: 20,
    backgroundColor: "rgba(23,18,16,0.88)",
    borderColor: "rgba(255,180,84,0.6)",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  plaqueKicker: { color: colors.ticket, fontFamily: fonts.mono, fontSize: 8.5, letterSpacing: 2.5 },
  plaqueTitle: { color: colors.amber, fontFamily: fonts.display, fontSize: 19, letterSpacing: 0.5 },
  plaqueYear: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11 },
});
