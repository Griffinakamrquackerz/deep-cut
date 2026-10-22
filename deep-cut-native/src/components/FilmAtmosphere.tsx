import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

// A single hairline burn down the screen, arriving once every ten seconds and
// gone again in under one — the scratch a worn stretch of film leaves as it
// passes the gate. Non-interactive, never blocks a tap, and reduced motion
// swaps the cycle for a steady faint line.
//
// Two layers used to live here and both had to go:
//
//  - A tiled film-grain, which relied on resizeMode="repeat". That doesn't tile
//    reliably on iOS, so one 128px tile drew at natural size in the top-left
//    and the opacity flicker turned it into a strobing rectangle.
//  - A projector vignette: a SQUARE 512x512 radial gradient stretched with
//    resizeMode="stretch" to a ~9:19.5 phone, i.e. 2.17x taller than wide. The
//    circular falloff became an ellipse and the plateau where the gradient
//    stopped read as a giant soft-edged box across the middle of the screen.
//
// Both were atmosphere that drew attention to itself, which is the one thing
// atmosphere must not do. The line alone does the job.

/** One appearance every this often. The burn is only visible for ~0.9s of it. */
const BURN_CYCLE_MS = 10_000;
const BURN_VISIBLE_MS = 900;

export default function FilmAtmosphere() {
  const reduced = useReducedMotion();
  const burnOp = useSharedValue(0);
  const burnJit = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      // No cycling for reduced motion, but don't drop the texture entirely —
      // hold it steady and faint instead.
      burnOp.value = 0.05;
      return;
    }
    // Absent most of the time, then a damaged stretch of film runs through the
    // gate: the scratch arrives, flickers for under a second, and is gone.
    // Never bright enough to pull the eye while it's there.
    burnOp.value = withRepeat(
      withSequence(
        withTiming(0, { duration: BURN_CYCLE_MS - BURN_VISIBLE_MS }),
        withTiming(0.12, { duration: 140 }),
        withTiming(0.05, { duration: 180 }),
        withTiming(0.13, { duration: 120 }),
        withTiming(0.06, { duration: 200 }),
        withTiming(0, { duration: 260 }),
      ),
      -1, // forward only — reversing would run the flicker backwards
    );
    // It wanders a hair the way a scratch drifts as the film runs. Cheap to
    // leave going; it only reads while the burn is actually visible.
    burnJit.value = withRepeat(withTiming(1, { duration: 640 }), -1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const burnStyle = useAnimatedStyle(() => ({
    opacity: burnOp.value,
    transform: [{ translateX: burnJit.value * 2 - 1 }],
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.burn, burnStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Hairline, running the full height a third of the way across — off-centre
  // to the left, the way a scratch sits on a worn print (film runs vertically
  // past the gate, so its wear does too). Extended past both ends so the drift
  // never exposes an edge.
  burn: {
    position: "absolute",
    top: -20,
    bottom: -20,
    left: "34%",
    width: 1,
    backgroundColor: "rgba(243,233,215,0.9)",
  },
});
