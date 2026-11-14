import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { router, usePathname } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { measureUsher, type UsherRect } from "@/lib/usher";
import { colors, fonts } from "@/lib/theme";

// The studio tour — a walk through the whole house, mounted in the tabs layout
// so it survives changing tabs.
//
// Two kinds of beat:
//   · Spotlight — a flashlight cutout over a real control on Tonight.
//   · Room — walks you into a tab and talks over the actual screen.
//
// The room beats used to be spotlights too, aimed at a rect computed from a
// hardcoded tab-bar height. Guessing another component's layout put the ring in
// empty space above the bar, so the tour pointed at nothing while describing
// something. Showing someone the room beats describing the icon that opens it.
//
// Shown on every launch until someone opts out. RUNS_KEY counts completed runs
// and the opt-out only appears from the second, so nobody dismisses the tour
// before seeing it and nobody is stuck with it after. A run only counts if a
// beat actually rendered — an earlier version wrote its "seen" flag even when
// every target was missing, which burned the tour without ever showing it.
const RUNS_KEY = "dc_studio_tour_runs";
const OPTOUT_KEY = "dc_studio_tour_optout";
const TAB_BAR_H = 84; // matches tabBarStyle.height in (tabs)/_layout.tsx

// Tabs remount as you move between them. Without this the tour would restart
// every time someone came back to the front room.
let firedThisSession = false;

type Room = "/tonight" | "/mixtapes" | "/community" | "/you" | "/settings";

interface Beat {
  id: string;
  /** Where this beat is shown. The tour navigates there before speaking. */
  route: Room;
  /** A registered target to spotlight. Absent = talk over the whole room. */
  target?: string;
  eyebrow: string;
  line: string;
}

// The eyebrow names the thing; the line must never restate it. One beat, one
// idea — except You and Settings, which carry the customization story.
const BEATS: Beat[] = [
  {
    id: "deal",
    route: "/tonight",
    target: "deal",
    eyebrow: "The dealer",
    line: "Three films, on the house. Watchlist it, seen it, or wave it off. Your PA is taking notes either way.",
  },
  {
    id: "dial",
    route: "/tonight",
    target: "dial",
    eyebrow: "The dial",
    line: "◆◆ is stuff people have heard of. ◆◆◆◆◆ is the back of the vault. Pick a mood, show only what's on your streaming platforms, then turn it as far as you dare.",
  },
  {
    id: "settle",
    route: "/tonight",
    target: "settle",
    eyebrow: "Can't agree?",
    line: "Two of you, one phone, five questions each. Nobody has to say “I don't care, you pick.” The house decides, and you both get to blame the house.",
  },
  {
    id: "roll",
    route: "/tonight",
    target: "roll",
    eyebrow: "Tired brain?",
    line: "Pick a channel and lie back. Trailers play one after another until something sticks.",
  },
  {
    id: "blend",
    route: "/tonight",
    target: "blend",
    eyebrow: "This meets that",
    line: "Name two or three films and watch their love child turn up.",
  },
  {
    id: "tv",
    route: "/tonight",
    target: "tv",
    eyebrow: "Deep Cut Theatre",
    line: "Award-winning indie films you've never seen, on a television in a basement. Pick a channel, a tape goes in, you watch. New bill every month.",
  },
  {
    id: "mixtapes",
    route: "/mixtapes",
    eyebrow: "Mixtapes",
    line: "Burn a tape out of the films you love and send it to someone. They send one back. That's the whole ritual.",
  },
  {
    id: "community",
    route: "/community",
    eyebrow: "The lobby",
    line: "See what everyone else is watching. Read the hot takes, follow the people who keep turning up the good stuff.",
  },
  {
    id: "you",
    route: "/you",
    eyebrow: "Your card",
    line: "This is what strangers see when they look you up. Loved films, the threads running through them, and a crew credit that climbs every time you rate something.",
  },
  {
    id: "settings",
    route: "/settings",
    eyebrow: "The booth",
    line: "Where you dress that card. Headshot, house colours, a signature film over the door. Tell it what you subscribe to while you're here, so it stops teasing you with films you can't watch.",
  },
];

export default function UsherTour() {
  const [beat, setBeat] = useState(-1);
  const [rect, setRect] = useState<UsherRect | null>(null);
  const [runs, setRuns] = useState(0);
  const shownAny = useRef(false);
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { height: screenH } = Dimensions.get("window");

  // Fire once per launch, shortly after mount so the marquee has painted.
  useEffect(() => {
    if (firedThisSession) return;
    let cancelled = false;
    Promise.all([AsyncStorage.getItem(OPTOUT_KEY), AsyncStorage.getItem(RUNS_KEY)])
      .then(([optedOut, runsRaw]) => {
        if (cancelled || optedOut) return;
        firedThisSession = true;
        setRuns(Number(runsRaw) || 0);
        setTimeout(() => !cancelled && setBeat(0), 900);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const finish = useCallback(() => {
    // Only count a run someone actually saw. A tour where every target failed
    // to measure has taught nobody anything and must not spend a run.
    if (shownAny.current) AsyncStorage.setItem(RUNS_KEY, String(runs + 1)).catch(() => {});
    setBeat(-1);
    setRect(null);
    router.replace("/tonight"); // the tour ends where it started
  }, [runs]);

  const optOut = useCallback(() => {
    AsyncStorage.setItem(OPTOUT_KEY, "1").catch(() => {});
    finish();
  }, [finish]);

  // Walk to the room this beat is about, then find its target (if it has one).
  useEffect(() => {
    if (beat < 0) return;
    if (beat >= BEATS.length) {
      finish();
      return;
    }
    const b = BEATS[beat];

    if (pathname !== b.route) {
      router.replace(b.route);
      return; // the pathname change re-runs this effect, now in the right room
    }

    if (!b.target) {
      shownAny.current = true;
      setRect(null); // room beat — the screen behind IS the illustration
      return;
    }

    const target = b.target;
    let cancelled = false;
    // Wait for the target instead of skipping it the instant it's missing.
    // Tonight's controls paint after its first fetch resolves, so a single
    // measurement taken 900ms in could miss every one of them.
    let tries = 0;
    const attempt = () => {
      if (cancelled) return;
      void measureUsher(target).then((r) => {
        if (cancelled) return;
        if (r) {
          shownAny.current = true;
          setRect({ x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 });
        } else if (++tries >= 15) {
          setBeat((x) => x + 1); // genuinely not there — move on
        } else {
          setTimeout(attempt, 200);
        }
      });
    };
    attempt();

    return () => {
      cancelled = true;
    };
  }, [beat, pathname, finish]);

  if (beat < 0 || beat >= BEATS.length) return null;
  const b = BEATS[beat];
  if (b.target && !rect) return null; // still hunting for it
  const spotlit = !!b.target && !!rect;

  const last = beat === BEATS.length - 1;
  const advance = () => {
    void Haptics.selectionAsync();
    setRect(null); // never show the old cutout against the next beat's room
    setBeat((x) => x + 1);
  };
  const retreat = () => {
    void Haptics.selectionAsync();
    setRect(null);
    setBeat((x) => Math.max(0, x - 1));
  };

  // Spotlight beats caption next to the lit control; room beats sit above the
  // tab bar, where they can't cover the room they're describing.
  const below = spotlit && rect!.y + rect!.height + 190 < screenH;
  const captionPos = !spotlit
    ? { bottom: TAB_BAR_H + insets.bottom + 12 }
    : below
      ? { top: rect!.y + rect!.height + 12 }
      : { bottom: screenH - rect!.y + 12 };

  const caption = (
    <View style={[styles.captionWrap, captionPos]}>
      <View style={styles.caption}>
        <Text style={styles.eyebrow}>
          🎬 The studio tour · {beat + 1}/{BEATS.length} — {b.eyebrow}
        </Text>
        <Text style={styles.line}>{b.line}</Text>
        {/* No skip. Tapping the dim still advances, so the tour can always be
            walked through — it just can't be dismissed unread. Back is the
            other half: without it a stray tap loses a beat for good. */}
        <View
          style={[
            styles.captionActions,
            beat === 0 && runs === 0 && { justifyContent: "flex-end" },
          ]}
        >
          {beat > 0 ? (
            <Pressable onPress={retreat} hitSlop={8} accessibilityRole="button">
              <Text style={styles.back}>← Back</Text>
            </Pressable>
          ) : runs > 0 ? (
            <Pressable onPress={optOut} hitSlop={8} accessibilityRole="button">
              <Text style={styles.back}>Don&apos;t show again</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.next} onPress={advance}>
            <Text style={styles.nextText}>{last ? "That's my seat ★" : "Next →"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  // Room beat: one soft scrim so the room stays readable behind the caption.
  if (!spotlit) {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Pressable style={[StyleSheet.absoluteFill, styles.roomScrim]} onPress={advance} />
        {caption}
      </View>
    );
  }

  // Spotlight beat: four dark panels around the cutout = a flashlight.
  const r = rect!;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={[styles.dark, { left: 0, right: 0, top: 0, height: r.y }]} onPress={advance} />
      <Pressable
        style={[styles.dark, { left: 0, top: r.y, height: r.height, width: r.x }]}
        onPress={advance}
      />
      <Pressable
        style={[styles.dark, { top: r.y, height: r.height, left: r.x + r.width, right: 0 }]}
        onPress={advance}
      />
      <Pressable
        style={[styles.dark, { left: 0, right: 0, top: r.y + r.height, bottom: 0 }]}
        onPress={advance}
      />
      <View
        pointerEvents="none"
        style={[styles.ring, { top: r.y, left: r.x, width: r.width, height: r.height }]}
      />
      {caption}
    </View>
  );
}

/**
 * Put the tour back. Opting out is permanent by design, so this is the only way
 * to see it again — and it clears the session guard too, otherwise a replay
 * asked for after the tour had already run would do nothing until a restart.
 */
export async function resetStudioTour(): Promise<void> {
  firedThisSession = false;
  await AsyncStorage.multiRemove([RUNS_KEY, OPTOUT_KEY]).catch(() => {});
}

const styles = StyleSheet.create({
  dark: { position: "absolute", backgroundColor: "rgba(13,9,7,0.85)" },
  // Lighter than the flashlight panels on purpose: the room behind is the point.
  roomScrim: { backgroundColor: "rgba(13,9,7,0.45)" },
  ring: {
    position: "absolute",
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.amber,
    shadowColor: colors.amber,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  captionWrap: { position: "absolute", left: "6%", width: "88%", maxWidth: 384, alignSelf: "center" },
  caption: {
    borderWidth: 1,
    borderColor: colors.ticket,
    borderStyle: "dashed",
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 14,
  },
  eyebrow: { color: colors.amber, fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase" },
  line: { color: colors.cream, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, marginTop: 4 },
  captionActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  back: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", textDecorationLine: "underline" },
  next: { backgroundColor: colors.amber, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 14 },
  nextText: { color: colors.bg, fontFamily: fonts.monoSemi, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase" },
});
