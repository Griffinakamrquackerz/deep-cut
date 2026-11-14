import React, { useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { tapeStripes } from "@/lib/tape";
import { colors, fonts, glowAmber, glowLight } from "@/lib/theme";

// The set-pieces — native port of the web's src/app/house.css and
// src/components/house/*.
//
// ui.tsx is the house style: what every screen is made of. This is the
// furniture that makes it a night at the pictures. Each piece is a real thing
// from a booth, a drive-in or a video store; if a new one can't be traced to
// something that existed, it's decoration and it doesn't belong here.
//
// The copy in these is written straight. The form is the joke — a ratings
// band, a credit roll — and a second joke inside it is where it turns corny.

// ── The slate ───────────────────────────────────────────────────────────
// How a screen announces itself: clapper stripes, then the scene. The clapper
// comes down once when the screen mounts.

export function Slate({
  children,
  note,
  center = false,
  style,
}: {
  /** The label, in ticket red. */
  children: React.ReactNode;
  /** A quieter second label after it. */
  note?: React.ReactNode;
  center?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const tilt = useSharedValue(reduced ? 0 : -24);
  useEffect(() => {
    if (reduced) return;
    tilt.value = withDelay(
      150,
      withSequence(
        withTiming(3, { duration: 190, easing: Easing.in(Easing.quad) }),
        withTiming(0, { duration: 110 }),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);
  const clap = useAnimatedStyle(() => ({ transform: [{ rotate: `${tilt.value}deg` }] }));

  return (
    <View style={[styles.slate, center && { justifyContent: "center" }, style]}>
      <Animated.View style={[styles.clapper, clap]}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={[styles.clapperStripe, { left: -6 + i * 9 }]} />
        ))}
      </Animated.View>
      <Text style={styles.slateLabel}>{children}</Text>
      {note ? <Text style={styles.slateNote}>{note}</Text> : null}
    </View>
  );
}

// ── The title card ──────────────────────────────────────────────────────
// A headline as projected light. `accent` is the word (or words) set in
// amber. There's no blur on a phone to rack focus with, so the entrance is
// the other half of a focus pull: it settles in from slightly too large.

export function TitleCard({
  children,
  accent,
  size = 44,
  center = false,
}: {
  children: string;
  accent?: string;
  size?: number;
  center?: boolean;
}) {
  const reduced = useReducedMotion();
  const t = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    t.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);
  const settle = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ scale: 1.05 - 0.05 * t.value }],
  }));

  const text = children.toUpperCase();
  const at = accent ? text.indexOf(accent.toUpperCase()) : -1;
  return (
    <Animated.Text
      style={[
        styles.titleCard,
        glowLight,
        { fontSize: size, lineHeight: size * 0.98 },
        center && { textAlign: "center" },
        settle,
      ]}
    >
      {at < 0 || !accent ? (
        text
      ) : (
        <>
          {text.slice(0, at)}
          <Text style={[styles.titleAccent, glowAmber]}>{text.slice(at, at + accent.length)}</Text>
          {text.slice(at + accent.length)}
        </>
      )}
    </Animated.Text>
  );
}

// ── The green band ──────────────────────────────────────────────────────
// "The following preview has been approved for…" — the card before every
// trailer. Ours approves tonight's deal for one person's taste.

export function RatingBand({
  what,
  audience,
  code = "DC",
  label,
  fine,
}: {
  what: string;
  audience: string;
  code?: string;
  label: string;
  fine: string;
}) {
  return (
    <View style={styles.band}>
      <Text style={styles.bandTop}>THE FOLLOWING {what.toUpperCase()} HAS BEEN APPROVED FOR</Text>
      <Text style={styles.bandAud}>{audience.toUpperCase()}</Text>
      <Text style={styles.bandTop}>BY THE HOUSE OF DEEP CUT</Text>
      <View style={styles.bandBox}>
        <View style={styles.bandCode}>
          <Text style={styles.bandCodeText}>{code}</Text>
        </View>
        <View style={styles.bandDetail}>
          <Text style={styles.bandLabel}>{label.toUpperCase()}</Text>
          <Text style={styles.bandFine}>{fine}</Text>
        </View>
      </View>
    </View>
  );
}

// ── The shelf talker ────────────────────────────────────────────────────
// The index card a video-store clerk tapes under a tape they need you to
// rent. Every recommendation's reason is one.

export function ShelfTalker({
  children,
  lines = 3,
  tilt = -0.8,
}: {
  children: string;
  lines?: number;
  /** Degrees. Alternate the sign down a list so the cards don't line up. */
  tilt?: number;
}) {
  return (
    <View style={[styles.talker, { transform: [{ rotate: `${tilt}deg` }] }]}>
      <View style={styles.talkerTape} />
      <Text style={styles.talkerTag}>★ WHY IT&apos;S YOURS</Text>
      <Text style={styles.talkerLine} numberOfLines={lines}>
        {children}
      </Text>
    </View>
  );
}

// ── The tape ────────────────────────────────────────────────────────────
// A mixtape on the shelf: black shell, paper label, a stripe in whatever
// colour the label printer had left.

export function Tape({
  id,
  name,
  meta,
  done,
  total,
  sticker,
  stickerKind = "red",
  onPress,
}: {
  id: string;
  name: string;
  meta: string;
  done?: number;
  total: number;
  sticker?: string;
  stickerKind?: "red" | "green";
  onPress: () => void;
}) {
  const stripes = tapeStripes(id);
  const pct = total > 0 && done != null ? Math.round((done / total) * 100) : 0;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tape, pressed && { opacity: 0.85 }]}>
      <View style={styles.tapeGrip}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <View key={i} style={styles.tapeGripRidge} />
        ))}
      </View>
      <View style={styles.tapeLabel}>
        <View style={styles.tapeStripes}>
          {stripes.map((c) => (
            <View key={c} style={{ flex: 1, backgroundColor: c }} />
          ))}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.tapeTitle} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.tapeMeta} numberOfLines={1}>
            {meta} · {total} FILM{total === 1 ? "" : "S"}
          </Text>
        </View>
      </View>
      <View style={styles.tapeSide}>
        {sticker ? (
          <View style={[styles.tapeSticker, stickerKind === "green" && { backgroundColor: "#2f5c46" }]}>
            <Text style={styles.tapeStickerText}>{sticker.toUpperCase()}</Text>
          </View>
        ) : (
          <Text style={styles.tapeSideText}>T-{String(total * 20).padStart(3, "0")}</Text>
        )}
        {done != null ? (
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <Text style={styles.tapeSideText}>
              {done}/{total}
            </Text>
            <View style={styles.tapeSpoolBar}>
              <View style={{ width: `${pct}%`, height: "100%", backgroundColor: colors.avail }} />
            </View>
          </View>
        ) : (
          <Text style={styles.tapeSideText}>↗</Text>
        )}
      </View>
    </Pressable>
  );
}

/** One spool behind the cassette window: a brown disc of tape round a white hub. */
function Spool({ fill }: { fill: number }) {
  const reduced = useReducedMotion();
  const spin = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    spin.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.linear }), -1);
    return () => cancelAnimation(spin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);
  const turn = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const size = 24 + Math.max(0, Math.min(1, fill)) * 36;
  return (
    <Animated.View
      style={[
        styles.spool,
        { width: size, height: size, borderRadius: size / 2 },
        turn,
      ]}
    >
      <View style={styles.spoolHub}>
        <View style={styles.spoolNotch} />
      </View>
    </Animated.View>
  );
}

// The same tape, face up, on its own screen. Crossing films off winds tape
// from the feed spool to the take-up.
export function CassetteFace({
  id,
  name,
  from,
  done,
  total,
}: {
  id: string;
  name: string;
  from: string;
  done: number;
  total: number;
}) {
  const stripes = tapeStripes(id);
  const wound = total > 0 ? done / total : 0;
  return (
    <View style={styles.cassette}>
      <View style={styles.cassetteLabel}>
        <View style={styles.cassetteTop}>
          <Text style={styles.cassetteSmall}>DEEP CUT VIDEO</Text>
          <Text style={styles.cassetteSmall}>
            SIDE A · {total} FILM{total === 1 ? "" : "S"}
          </Text>
        </View>
        <Text style={styles.cassetteTitle}>{name}</Text>
        <Text style={styles.cassetteFrom}>{from.toUpperCase()}</Text>
        <View style={styles.cassetteStripes}>
          {stripes.map((c) => (
            <View key={c} style={{ flex: 1, backgroundColor: c }} />
          ))}
        </View>
      </View>
      <View style={styles.cassetteWindow}>
        <View style={styles.spoolSeat}>
          <Spool fill={1 - wound} />
        </View>
        <Text style={styles.cassetteCount}>
          {done}/{total}
        </Text>
        <View style={styles.spoolSeat}>
          <Spool fill={wound} />
        </View>
      </View>
      <Text style={styles.cassetteFoot}>
        {done}/{total} CROSSED OFF{done === total && total > 0 ? " · BE KIND, REWIND" : ""}
      </Text>
    </View>
  );
}

// ── End credits ─────────────────────────────────────────────────────────
// A crawl in a window: role in italics, name in caps. Speed is set from how
// much there is to read. With reduced motion it's a list, not a crawl.

export interface Credit {
  role: string;
  names: string[];
  /** Lights the names amber — the line that's about the reader. */
  you?: boolean;
}

const ROLL_HEIGHT = 230;

export function CreditRoll({ credits, tail }: { credits: Credit[]; tail?: string }) {
  const reduced = useReducedMotion();
  const [h, setH] = useState(0);
  const y = useSharedValue(ROLL_HEIGHT);

  useEffect(() => {
    if (reduced || h === 0) return;
    y.value = ROLL_HEIGHT;
    // ~34pt a second: slow enough to read a name as it passes.
    y.value = withRepeat(
      withTiming(-h, { duration: ((ROLL_HEIGHT + h) / 34) * 1000, easing: Easing.linear }),
      -1,
    );
    return () => cancelAnimation(y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, h]);
  const crawl = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  const body = (
    <>
      {credits.map((c, i) => (
        <View key={`${c.role}-${i}`} style={{ alignItems: "center" }}>
          <Text style={styles.creditRole}>{c.role}</Text>
          {c.names.map((n, j) => (
            <Text key={j} style={[styles.creditName, glowLight, c.you && styles.creditYou]}>
              {n.toUpperCase()}
            </Text>
          ))}
        </View>
      ))}
      {tail ? <Text style={styles.creditTail}>{tail.toUpperCase()}</Text> : null}
      <Text style={styles.creditLogo}>
        DEEP CUT<Text style={{ color: colors.ticket }}>.</Text>
      </Text>
    </>
  );

  if (reduced) {
    return <View style={[styles.roll, { height: undefined, paddingVertical: 22, gap: 20 }]}>{body}</View>;
  }
  return (
    <View style={styles.roll} accessibilityLabel="Credits">
      <Animated.View
        style={[styles.rollCrawl, crawl]}
        onLayout={(e: LayoutChangeEvent) => setH(e.nativeEvent.layout.height)}
      >
        {body}
      </Animated.View>
      {/* The crawl fades in and out of the dark rather than hitting an edge. */}
      <View pointerEvents="none" style={[styles.rollFade, { top: 0 }]} />
      <View pointerEvents="none" style={[styles.rollFade, { bottom: 0, opacity: 0.85 }]} />
    </View>
  );
}

// ── The billing block ───────────────────────────────────────────────────
// The squeezed type at the foot of a one-sheet: small word for the job, tall
// word for the person.

export function BillingBlock({
  crew,
  onPress,
}: {
  crew: Array<{ id: number; job: string; name: string }>;
  onPress?: (id: number) => void;
}) {
  return (
    <View style={styles.billing}>
      <Text style={styles.billingText}>
        {crew.map((c, i) => (
          <Text key={`${c.id}-${c.job}`}>
            {i > 0 ? "  " : ""}
            <Text style={styles.billingJob}>{c.job.toLowerCase()} </Text>
            <Text style={styles.billingName} onPress={onPress ? () => onPress(c.id) : undefined}>
              {c.name.toUpperCase()}
            </Text>
          </Text>
        ))}
      </Text>
    </View>
  );
}

// ── The intermission snipe ──────────────────────────────────────────────
// Between features a drive-in ran a reel with a clock on it — ten minutes to
// showtime, nine, eight. This is that card and the clock runs, then starts
// again, because the show never does start. It's an intermission.

const SNIPE_START = 10 * 60;

export function Snipe({
  kicker = "Intermission",
  title,
  line,
  cta,
  onPress,
  style,
}: {
  kicker?: string;
  title: string;
  line: string;
  cta: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [left, setLeft] = useState(SNIPE_START);
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => (s <= 1 ? SNIPE_START : s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  // The hand sweeps once a minute, like the second hand it's standing in for.
  const hand = ((60 - (left % 60)) % 60) * 6;

  return (
    <View style={[styles.snipe, style]}>
      <View style={styles.snipeClock}>
        <View style={[styles.snipeHandWrap, { transform: [{ rotate: `${hand}deg` }] }]}>
          <View style={styles.snipeHand} />
        </View>
        <Text style={styles.snipeTime}>
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
        </Text>
        <Text style={styles.snipeTo}>TO SHOWTIME</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.snipeKicker}>{kicker}</Text>
        <Text style={styles.snipeTitle}>{title.toUpperCase()}</Text>
        <Text style={styles.snipeLine}>{line}</Text>
        <Pressable onPress={onPress} style={styles.snipeCta}>
          <Text style={styles.snipeCtaText}>{cta.toUpperCase()} →</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── End of reel ─────────────────────────────────────────────────────────
// Tail leader at the foot of a screen. Give it `onRewind` and it's also the
// way back to the top, which is what rewinding was for.

export function ReelEnd({ onRewind }: { onRewind?: () => void }) {
  const marks = (
    <>
      <View style={styles.reelMarks}>
        <View style={styles.reelDot} />
        <View style={styles.reelDot} />
        <View style={styles.reelCue} />
        <View style={styles.reelDot} />
        <View style={styles.reelDot} />
      </View>
      <Text style={styles.reelSmall}>END OF REEL</Text>
      {onRewind ? <Text style={styles.reelBig}>BE KIND · REWIND ↑</Text> : null}
    </>
  );
  if (!onRewind) return <View style={styles.reelEnd}>{marks}</View>;
  return (
    <Pressable onPress={onRewind} style={styles.reelEnd} accessibilityLabel="Back to the top">
      {marks}
    </Pressable>
  );
}

// ── Reel missing / the film broke ───────────────────────────────────────
// Two cards a projectionist keeps by the booth window.

export function BoothCard({
  big,
  sorry,
  signed,
  note,
  children,
}: {
  big: string;
  sorry: string;
  signed: string;
  note: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.boothPage}>
      <View style={styles.boothFrameOuter}>
        <View style={styles.boothFrame}>
          <Text style={[styles.boothBig, glowLight]}>{big.toUpperCase()}</Text>
          <Text style={styles.boothSorry}>{sorry}</Text>
          <Text style={styles.boothSigned}>— {signed.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.boothNote}>{note}</Text>
      <View style={styles.boothActions}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  // slate
  slate: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 },
  clapper: {
    width: 40,
    height: 11,
    borderRadius: 2,
    backgroundColor: "#14100e",
    overflow: "hidden",
    transformOrigin: "left bottom",
  },
  clapperStripe: {
    position: "absolute",
    top: -6,
    width: 5,
    height: 24,
    backgroundColor: colors.cream,
    transform: [{ rotate: "35deg" }],
  },
  slateLabel: {
    color: colors.ticket,
    fontFamily: fonts.monoSemi,
    fontSize: 10,
    letterSpacing: 2.6,
    textTransform: "uppercase",
  },
  slateNote: {
    color: colors.dim,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 2.2,
    textTransform: "uppercase",
  },
  // title card
  titleCard: { color: colors.light, fontFamily: fonts.display, letterSpacing: 0.6, marginTop: 8 },
  titleAccent: { color: colors.amber },
  // green band
  band: {
    borderRadius: 10,
    backgroundColor: "#1d6a3c",
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  bandTop: { color: "#fff", fontWeight: "700", fontSize: 9.5, letterSpacing: 1.3, textAlign: "center" },
  bandAud: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 22,
    lineHeight: 25,
    letterSpacing: 0.8,
    textAlign: "center",
    marginVertical: 6,
  },
  bandBox: {
    flexDirection: "row",
    alignSelf: "stretch",
    marginTop: 12,
    borderWidth: 3,
    borderColor: "#fff",
    backgroundColor: "#fff",
  },
  bandCode: { backgroundColor: "#111", paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  bandCodeText: { color: "#fff", fontWeight: "800", fontSize: 24 },
  bandDetail: { flex: 1, paddingVertical: 7, paddingHorizontal: 10, gap: 2 },
  bandLabel: { color: "#111", fontWeight: "800", fontSize: 12, letterSpacing: 0.8 },
  bandFine: { color: "#111", fontSize: 11, lineHeight: 14 },
  // shelf talker
  talker: {
    marginTop: 10,
    backgroundColor: colors.paper,
    borderRadius: 2,
    paddingVertical: 8,
    paddingHorizontal: 10,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  talkerTape: {
    position: "absolute",
    top: -6,
    right: 16,
    width: 38,
    height: 13,
    backgroundColor: "rgba(255,214,150,0.7)",
    transform: [{ rotate: "4deg" }],
  },
  talkerTag: { color: "#a8371d", fontFamily: fonts.monoSemi, fontSize: 8, letterSpacing: 1.8 },
  talkerLine: { color: colors.paperInk, fontFamily: fonts.serif, fontSize: 18, lineHeight: 21, marginTop: 2 },
  // tape
  tape: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    minHeight: 68,
    padding: 8,
    paddingRight: 12,
    borderRadius: 6,
    backgroundColor: "#14100e",
    borderWidth: 1,
    borderColor: "#000",
  },
  tapeGrip: { width: 12, justifyContent: "center", gap: 3 },
  tapeGripRidge: { height: 2, borderRadius: 1, backgroundColor: "rgba(255,255,255,0.12)" },
  tapeLabel: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 2,
    backgroundColor: colors.paper,
    overflow: "hidden",
    paddingRight: 10,
  },
  tapeStripes: { width: 15, alignSelf: "stretch", flexDirection: "row" },
  tapeTitle: { color: colors.paperInk, fontFamily: fonts.serif, fontSize: 21, lineHeight: 24 },
  tapeMeta: { color: colors.paperDim, fontFamily: fonts.mono, fontSize: 8, letterSpacing: 1.4, marginTop: 1 },
  tapeSide: { alignItems: "flex-end", justifyContent: "space-between", paddingVertical: 2 },
  tapeSideText: { color: colors.dim, fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1.2 },
  tapeSticker: {
    backgroundColor: colors.ticket,
    borderRadius: 2,
    paddingVertical: 2,
    paddingHorizontal: 5,
    transform: [{ rotate: "-5deg" }],
  },
  tapeStickerText: { color: colors.cream, fontFamily: fonts.monoSemi, fontSize: 7.5, letterSpacing: 1 },
  tapeSpoolBar: { width: 62, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
  // cassette
  cassette: {
    borderRadius: 10,
    backgroundColor: "#14100e",
    borderWidth: 1,
    borderColor: "#000",
    padding: 10,
    paddingBottom: 9,
  },
  cassetteLabel: { backgroundColor: colors.paper, borderRadius: 3, overflow: "hidden", padding: 12, paddingBottom: 20 },
  cassetteTop: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  cassetteSmall: { color: colors.paperDim, fontFamily: fonts.mono, fontSize: 8.5, letterSpacing: 1.8 },
  cassetteTitle: { color: colors.paperInk, fontFamily: fonts.serif, fontSize: 36, lineHeight: 38, marginTop: 8 },
  cassetteFrom: { color: colors.paperDim, fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1.2, marginTop: 6 },
  cassetteStripes: { position: "absolute", left: 0, right: 0, bottom: 0, height: 8 },
  cassetteWindow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "center",
    width: 250,
    maxWidth: "100%",
    height: 74,
    marginTop: 10,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: "#060504",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  spoolSeat: { width: 62, height: 62, alignItems: "center", justifyContent: "center" },
  spool: { backgroundColor: "#3d2a1e", borderWidth: 1, borderColor: "#000", alignItems: "center", justifyContent: "center" },
  spoolHub: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.cream,
    borderWidth: 3,
    borderColor: "#1a1412",
    alignItems: "center",
    justifyContent: "center",
  },
  spoolNotch: { width: 2, height: 6, backgroundColor: "#1a1412" },
  cassetteCount: { color: colors.amber, fontFamily: fonts.display, fontSize: 22, letterSpacing: 1.5 },
  cassetteFoot: {
    color: colors.dim,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.8,
    textAlign: "center",
    marginTop: 8,
  },
  // credits
  roll: {
    height: ROLL_HEIGHT,
    overflow: "hidden",
    borderRadius: 6,
    backgroundColor: "#080605",
    borderWidth: 1,
    borderColor: "rgba(243,233,215,0.08)",
    alignItems: "center",
  },
  rollCrawl: { position: "absolute", left: 0, right: 0, top: 0, alignItems: "center", gap: 22, paddingHorizontal: 14 },
  rollFade: { position: "absolute", left: 0, right: 0, height: 34, backgroundColor: "#080605", opacity: 0.9 },
  creditRole: { color: colors.dim, fontFamily: fonts.serif, fontSize: 16, lineHeight: 18 },
  creditName: {
    color: colors.light,
    fontFamily: fonts.display,
    fontSize: 20,
    lineHeight: 23,
    letterSpacing: 3,
    textAlign: "center",
    marginTop: 3,
  },
  creditYou: { color: colors.amber },
  creditTail: {
    color: colors.dim,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.4,
    lineHeight: 15,
    textAlign: "center",
    maxWidth: 260,
  },
  creditLogo: { color: colors.cream, fontFamily: fonts.display, fontSize: 32, letterSpacing: 2.5 },
  // billing block
  billing: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 14 },
  billingText: { textAlign: "center", lineHeight: 28 },
  billingJob: { color: colors.dim, fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.8 },
  billingName: {
    color: colors.cream,
    fontFamily: fonts.display,
    fontSize: 20,
    letterSpacing: 2.6,
    textDecorationLine: "underline",
    textDecorationColor: "rgba(255,180,84,0.45)",
  },
  // snipe
  snipe: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 10,
    padding: 14,
    backgroundColor: "#3a1620",
    borderWidth: 1,
    borderColor: "rgba(255,180,84,0.35)",
  },
  snipeClock: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: colors.light,
    backgroundColor: "#2a0f17",
    alignItems: "center",
    justifyContent: "center",
  },
  snipeHandWrap: { position: "absolute", width: 80, height: 80, alignItems: "center" },
  snipeHand: { width: 2, height: 34, marginTop: 3, backgroundColor: "rgba(255,180,84,0.55)" },
  snipeTime: { color: colors.light, fontFamily: fonts.display, fontSize: 23, lineHeight: 24 },
  snipeTo: { color: colors.amber, fontFamily: fonts.mono, fontSize: 6, letterSpacing: 1.2 },
  snipeKicker: { color: colors.amber, fontFamily: fonts.serif, fontSize: 18, lineHeight: 20 },
  snipeTitle: { color: colors.light, fontFamily: fonts.display, fontSize: 27, lineHeight: 27, letterSpacing: 0.6, marginTop: 2 },
  snipeLine: { color: "rgba(243,233,215,0.85)", fontFamily: fonts.body, fontSize: 13, lineHeight: 18, marginTop: 5 },
  snipeCta: { alignSelf: "flex-start", marginTop: 10, borderRadius: 3, backgroundColor: colors.amber, paddingVertical: 7, paddingHorizontal: 13 },
  snipeCtaText: { color: colors.bg, fontFamily: fonts.monoSemi, fontSize: 10, letterSpacing: 1.8 },
  // reel end
  reelEnd: {
    alignItems: "center",
    gap: 7,
    marginTop: 28,
    paddingTop: 18,
    paddingBottom: 6,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.line,
  },
  reelMarks: { flexDirection: "row", alignItems: "center", gap: 9 },
  reelDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: colors.dim, opacity: 0.6 },
  reelCue: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.amber, opacity: 0.85 },
  reelSmall: { color: colors.dim, fontFamily: fonts.mono, fontSize: 9, letterSpacing: 3.4 },
  reelBig: { color: colors.cream, fontFamily: fonts.display, fontSize: 19, letterSpacing: 2.6 },
  // booth cards
  boothPage: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: 24 },
  boothFrameOuter: {
    alignSelf: "stretch",
    borderWidth: 1,
    borderColor: "rgba(255,241,214,0.7)",
    padding: 3,
    transform: [{ rotate: "-0.4deg" }],
  },
  boothFrame: {
    borderWidth: 1,
    borderColor: "rgba(255,241,214,0.7)",
    paddingVertical: 34,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  boothBig: { color: colors.light, fontFamily: fonts.display, fontSize: 68, lineHeight: 62, letterSpacing: 2, textAlign: "center" },
  boothSorry: { color: colors.cream, fontFamily: fonts.serif, fontSize: 23, lineHeight: 27, textAlign: "center", marginTop: 16 },
  boothSigned: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 3.4, marginTop: 10 },
  boothNote: {
    color: colors.dim,
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 18,
    textAlign: "center",
    maxWidth: 300,
    marginTop: 22,
  },
  boothActions: { alignSelf: "stretch", gap: 10, marginTop: 22 },
});
