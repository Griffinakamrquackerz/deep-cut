import React, { useEffect, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { colors } from "@/lib/theme";

// Ticket-stub confetti — fires when someone logs a film with love (web:
// Confetti on "loved"). Bump the `fire` counter to burst; pieces clean
// themselves up. Reduced motion skips the party (politely).
const PIECE_COLORS = [colors.amber, colors.ticket, colors.cream, colors.avail];

function Piece({ delay, x, drift, color }: { delay: number; x: number; drift: number; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 1100 + delay, easing: Easing.out(Easing.quad) });
  }, [delay, t]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - t.value,
    transform: [
      { translateX: x + drift * t.value },
      { translateY: -30 + 300 * t.value },
      { rotate: `${drift * 4 * t.value}deg` },
    ],
  }));
  return <Animated.View style={[styles.piece, { backgroundColor: color }, style]} />;
}

export default function Confetti({ fire }: { fire: number }) {
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [burst, setBurst] = useState<number | null>(null);

  useEffect(() => {
    if (fire <= 0 || reduced) return;
    setBurst(fire);
    const t = setTimeout(() => setBurst(null), 1600);
    return () => clearTimeout(t);
  }, [fire, reduced]);

  if (burst === null) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: 18 }, (_, i) => (
        <Piece
          key={`${burst}-${i}`}
          delay={(i % 6) * 60}
          x={(width / 18) * i}
          drift={((i % 5) - 2) * 30}
          color={PIECE_COLORS[i % PIECE_COLORS.length]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: {
    position: "absolute",
    top: 60,
    width: 8,
    height: 12,
    borderRadius: 2,
  },
});
