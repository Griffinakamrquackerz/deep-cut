import { Image } from "expo-image";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { colors, fonts, glowAmber, posterUrl } from "@/lib/theme";

// The camp UI kit — the native port of the web app's design system.
// Marquee bulbs, film strips, amber glow, Plex-mono eyebrows, Bebas marquees.

/** Row of marquee bulbs (web: MarqueeBulbs + bulb-chase) — spans the full
 *  container width, count adapts to the space, and each bulb breathes on a
 *  staggered cycle so the light chases down the marquee. Reduced motion
 *  freezes the pattern. */
const BULB_GLOW: number[] = [1, 0.32, 0.8, 0.5, 0.95, 0.4];

function Bulb({ index, animate }: { index: number; animate: boolean }) {
  const base = BULB_GLOW[index % BULB_GLOW.length];
  const glow = useSharedValue(base);
  useEffect(() => {
    if (!animate) {
      glow.value = base;
      return;
    }
    glow.value = withDelay(
      (index % BULB_GLOW.length) * 200,
      withRepeat(
        withSequence(withTiming(1, { duration: 750 }), withTiming(0.3, { duration: 750 })),
        -1,
        true,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, index]);
  const style = useAnimatedStyle(() => ({ opacity: glow.value }));
  return <Animated.View style={[styles.bulb, base >= 0.7 && styles.bulbLit, style]} />;
}

export function MarqueeBulbs() {
  const [count, setCount] = React.useState(0);
  const reduced = useReducedMotion();
  return (
    <View
      style={styles.bulbRow}
      onLayout={(e) => setCount(Math.max(8, Math.floor(e.nativeEvent.layout.width / 24)))}
    >
      {Array.from({ length: count }, (_, i) => (
        <Bulb key={i} index={i} animate={!reduced} />
      ))}
    </View>
  );
}

/** Sprocket-hole film strip divider (web: .film-strip). */
export function FilmStrip({ holes = 16 }: { holes?: number }) {
  return (
    <View style={styles.strip}>
      {Array.from({ length: holes }, (_, i) => (
        <View key={i} style={styles.sprocket} />
      ))}
    </View>
  );
}

export function Eyebrow({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.eyebrow, style]}>{children}</Text>;
}

/** The big amber headline, Bebas + glow (web: font-display + .glow-amber).
 *  By default it buzzes like a half-dead motel VACANCY sign (web:
 *  .neon-flicker) — an irregular 4s flicker. Pass flicker={false} to hold it
 *  steady; reduced motion freezes it lit. */
export function Marquee({
  children,
  size = 44,
  flicker = true,
}: {
  children: React.ReactNode;
  size?: number;
  flicker?: boolean;
}) {
  const reduced = useReducedMotion();
  const op = useSharedValue(1);
  useEffect(() => {
    if (!flicker || reduced) {
      op.value = 1;
      return;
    }
    // Mirrors @keyframes neon-flicker: two quick stutters early, one mid-cycle.
    op.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 720 }),
        withTiming(0.55, { duration: 80 }),
        withTiming(1, { duration: 80 }),
        withTiming(0.55, { duration: 80 }),
        withTiming(1, { duration: 40 }),
        withTiming(1, { duration: 1120 }),
        withTiming(0.55, { duration: 80 }),
        withTiming(1, { duration: 80 }),
        withTiming(1, { duration: 1720 }),
      ),
      -1,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flicker, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: op.value }));
  return (
    <Animated.Text
      style={[styles.marquee, glowAmber, { fontSize: size, lineHeight: size * 1.02 }, style]}
    >
      {children}
    </Animated.Text>
  );
}

export function Button({
  title,
  onPress,
  kind = "primary",
  size = "md",
  disabled,
  busy,
  pulse = false,
}: {
  title: string;
  onPress: () => void;
  kind?: "primary" | "outline" | "ghost";
  size?: "md" | "sm";
  disabled?: boolean;
  busy?: boolean;
  /** Carnival-button treatment for the marquee CTA (web: .pulse-cta) — a
   *  breathing scale, a red glow, and a sheen that sweeps across. */
  pulse?: boolean;
}) {
  const sm = size === "sm";
  const reduced = useReducedMotion();
  const alive = pulse && kind === "primary" && !disabled && !busy && !reduced;

  const scale = useSharedValue(1);
  const sheen = useSharedValue(0);
  useEffect(() => {
    if (!alive) {
      scale.value = 1;
      sheen.value = 0;
      return;
    }
    scale.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
    sheen.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.linear }), -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alive]);
  const wrapStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const sheenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -200 + sheen.value * 460 }, { rotate: "20deg" }],
  }));

  const inner = (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.btn,
        sm && styles.btnSm,
        kind === "primary" && styles.btnPrimary,
        kind === "outline" && styles.btnOutline,
        pulse && kind === "primary" && styles.btnGlow,
        pulse && { overflow: "hidden" },
        (disabled || busy) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
      ]}
    >
      {alive && <Animated.View pointerEvents="none" style={[styles.sheen, sheenStyle]} />}
      {busy ? (
        <ActivityIndicator color={kind === "primary" ? colors.cream : colors.amber} />
      ) : (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={[
            styles.btnText,
            sm && styles.btnTextSm,
            kind === "outline" && { color: colors.amber },
            kind === "ghost" && { color: colors.dim },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );

  if (!alive) return inner;
  return <Animated.View style={wrapStyle}>{inner}</Animated.View>;
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && { borderColor: colors.amber, backgroundColor: "rgba(255,180,84,0.12)" }]}
    >
      <Text style={[styles.chipText, active && { color: colors.amber }]}>{label}</Text>
    </Pressable>
  );
}

export function ObscurityDots({ score }: { score: number }) {
  return (
    <Text style={styles.dots}>
      {Array.from({ length: 5 }, (_, i) => (i < score ? "◆" : "◇")).join(" ")}
    </Text>
  );
}

/** Poster with the typographic fallback card the web uses when TMDB has no art.
 *  An optional `badge` (e.g. "★ 6.6") rides the top-left corner so ratings show
 *  even in tight poster grids. */
export function Poster({
  path,
  title,
  year,
  width,
  badge,
}: {
  path: string | null | undefined;
  title: string;
  year?: number | null;
  width: number;
  badge?: string | null;
}) {
  const height = Math.round(width * 1.5);
  const url = posterUrl(path);
  const badgeEl = badge ? (
    <View style={styles.posterBadge}>
      <Text style={styles.posterBadgeText}>{badge}</Text>
    </View>
  ) : null;
  if (!url) {
    return (
      <View style={[styles.posterFallback, { width, height }]}>
        <Text style={styles.posterFallbackTitle} numberOfLines={4}>
          {title.toUpperCase()}
        </Text>
        {year != null && <Text style={styles.posterFallbackYear}>{year}</Text>}
        {badgeEl}
      </View>
    );
  }
  return (
    <View style={{ width, height }}>
      <Image
        source={{ uri: url }}
        style={{ width, height, borderRadius: 6, backgroundColor: colors.surface }}
        contentFit="cover"
        transition={150}
      />
      {badgeEl}
    </View>
  );
}

const styles = StyleSheet.create({
  bulbRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    alignSelf: "stretch",
    paddingVertical: 4,
  },
  bulb: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.amber },
  bulbLit: {
    shadowColor: colors.amber,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  strip: {
    flexDirection: "row",
    gap: 7,
    backgroundColor: "#0d0a08",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 2,
    overflow: "hidden",
    alignItems: "center",
  },
  sprocket: { width: 9, height: 6, borderRadius: 1.5, backgroundColor: "#241c17" },
  eyebrow: {
    color: colors.dim,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  marquee: {
    color: colors.amber,
    fontFamily: fonts.display,
    letterSpacing: 1.5,
  },
  btn: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  btnSm: { paddingVertical: 10, paddingHorizontal: 8 },
  btnPrimary: { backgroundColor: colors.ticket },
  btnGlow: {
    shadowColor: colors.ticket,
    shadowOpacity: 0.6,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  sheen: {
    position: "absolute",
    top: -24,
    bottom: -24,
    width: 46,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  btnOutline: { borderWidth: 1, borderColor: colors.amber },
  btnText: {
    color: colors.cream,
    fontFamily: fonts.monoSemi,
    fontSize: 12,
    letterSpacing: 2.5,
    textTransform: "uppercase",
  },
  btnTextSm: { fontSize: 10, letterSpacing: 1 },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipText: { color: colors.dim, fontFamily: fonts.mono, fontSize: 12 },
  dots: { color: colors.amber, fontSize: 12, letterSpacing: 2 },
  posterFallback: {
    borderRadius: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    justifyContent: "center",
  },
  posterFallbackTitle: {
    color: colors.cream,
    fontFamily: fonts.display,
    fontSize: 18,
    letterSpacing: 1,
  },
  posterFallbackYear: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11, marginTop: 6 },
  posterBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    backgroundColor: "rgba(13,9,7,0.85)",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  posterBadgeText: { color: colors.amber, fontFamily: fonts.monoSemi, fontSize: 9 },
});
