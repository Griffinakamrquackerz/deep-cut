import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { colors, fonts } from "@/lib/theme";

// The rooms — native port of the web's src/app/platform.css.
//
// ui.tsx is what every screen is made of and house.tsx is the furniture. This
// is the building: each tab is a place in a picture house and looks like it.
//
//   Tonight     a marquee, a box office, the night's films on a shelf
//   Community   the felt board over the concession stand, and a corkboard
//   You         a membership card, and the punch card behind it
//   Settings    the booth's control panel, labelled in embossing tape
//
// Rule of the house: the camp is in the objects, never in the copy. A brass
// plate reads "BOX OFFICE", not something clever.

// ── The marquee ─────────────────────────────────────────────────────────
// A backlit letterboard over the door: black letters hung on tracks by hand,
// none of them quite straight, the words that matter in red. It carries
// tonight's date, because a marquee that never changes is just a sign.

const ROW = 46;

function BulbRow({ lit }: { lit: SharedValue<number> }) {
  const [n, setN] = useState(0);
  const a = useAnimatedStyle(() => ({ opacity: 0.45 + 0.55 * lit.value }));
  const b = useAnimatedStyle(() => ({ opacity: 1 - 0.55 * lit.value }));
  return (
    <View
      style={styles.mqBulbs}
      onLayout={(e) => setN(Math.max(6, Math.floor(e.nativeEvent.layout.width / 14)))}
    >
      {Array.from({ length: n }, (_, i) => (
        <Animated.View key={i} style={[styles.mqBulb, i % 2 ? a : b]} />
      ))}
    </View>
  );
}

export function MarqueeBoard({
  title,
  red = "",
  label = "Tonight",
}: {
  title: string;
  /** Words of the title to set in red, space-separated. */
  red?: string;
  label?: string;
}) {
  const reduced = useReducedMotion();
  const lit = useSharedValue(0);
  const [rows, setRows] = useState(1);
  const [date, setDate] = useState("");

  useEffect(() => {
    setDate(
      new Date()
        .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
        .replace(",", " ·")
        .toUpperCase(),
    );
  }, []);
  useEffect(() => {
    if (reduced) return;
    // The chase: alternate bulbs trade places twice a second.
    lit.value = withRepeat(
      withSequence(withTiming(1, { duration: 550 }), withTiming(0, { duration: 550 })),
      -1,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const reds = new Set(red.toLowerCase().split(/\s+/).filter(Boolean));
  let n = 0;
  return (
    <View style={styles.mq} accessibilityRole="header" accessibilityLabel={title}>
      <BulbRow lit={lit} />
      <View style={styles.mqPlate}>
        <Text style={styles.mqLabel}>{label.toUpperCase()}</Text>
        <Text style={styles.mqDate}>{date}</Text>
      </View>
      <View
        style={styles.mqBoard}
        onLayout={(e) => setRows(Math.max(1, Math.round(e.nativeEvent.layout.height / ROW)))}
      >
        {/* the tracks the letters hang on */}
        {Array.from({ length: rows }, (_, i) => (
          <View key={i} pointerEvents="none" style={[styles.mqTrack, { top: (i + 1) * ROW - 3 }]} />
        ))}
        <View style={styles.mqWords} importantForAccessibility="no-hide-descendants">
          {title
            .toUpperCase()
            .split(/\s+/)
            .map((word, w) => (
              <View key={w} style={styles.mqWord}>
                {Array.from(word).map((ch) => {
                  const i = n++;
                  return (
                    <Text
                      key={i}
                      style={[
                        styles.mqLetter,
                        reds.has(word.toLowerCase()) && { color: "#c2281c" },
                        {
                          transform: [
                            { translateY: (((i * 53) % 5) - 2) * 0.5 },
                            { rotate: `${(((i * 37) % 7) - 3) * 0.45}deg` },
                          ],
                        },
                      ]}
                    >
                      {ch}
                    </Text>
                  );
                })}
              </View>
            ))}
        </View>
      </View>
      <BulbRow lit={lit} />
    </View>
  );
}

// ── The box office ──────────────────────────────────────────────────────
// A wooden booth, a brass plate, a pane of glass with a speaker grille in it,
// and a slot the tickets come out of. `glass` holds the dial; `children` is
// what sits in the slot (the deal button).

export function BoxOffice({ glass, children }: { glass: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.bo}>
      <View style={styles.boPlate}>
        <View style={styles.boScrew} />
        <Text style={styles.boPlateText}>BOX OFFICE</Text>
        <View style={styles.boScrew} />
      </View>
      <View style={styles.boGlass}>{glass}</View>
      <View style={styles.boSlot}>
        {children}
        <Text style={styles.boSlotLabel}>TICKETS</Text>
      </View>
    </View>
  );
}

/** The brass speaker grille in the glass. */
export function Grille() {
  return (
    <View style={styles.grille}>
      {[0, 1, 2].map((r) => (
        <View key={r} style={{ flexDirection: "row", gap: 3 }}>
          {[0, 1, 2].map((c) => (
            <View key={c} style={styles.grilleHole} />
          ))}
        </View>
      ))}
    </View>
  );
}

// ── The shelf ───────────────────────────────────────────────────────────
// A rental case, a sticker, the dots a video store sorts by, three stamps,
// and the wooden lip of the shelf it's standing on.

/** The clamshell a one-sheet sits in. */
export function VhsCase({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.vhsCase}>
      <View style={styles.vhsSpine} />
      {children}
    </View>
  );
}

export function CaseSticker({ children }: { children: string }) {
  return (
    <View style={styles.sticker}>
      <Text style={styles.stickerText}>{children.toUpperCase()}</Text>
    </View>
  );
}

// Kept in step with the web's src/lib/genre-dots.ts.
const DOTS: Record<string, string> = {
  Horror: "#d6402b",
  Thriller: "#c9742b",
  Comedy: "#e8c13a",
  Drama: "#5c8fc9",
  "Science Fiction": "#3fb6a8",
  Fantasy: "#9a6fd0",
  Animation: "#6cc070",
  Romance: "#e07a9a",
  Documentary: "#9aa08a",
  Crime: "#7d7fa8",
  Western: "#b88a4a",
  Music: "#d05cc0",
  Mystery: "#6a78c8",
  Adventure: "#d99a3a",
  Action: "#d95a3a",
  Family: "#8fc98a",
  History: "#a89070",
  War: "#8a8a6a",
};

export function GenreDots({ genres }: { genres: string[] }) {
  if (!genres?.length) return null;
  return (
    <View style={styles.dots}>
      {genres.slice(0, 3).map((g) => (
        <View key={g} style={styles.dotItem}>
          <View style={[styles.dot, { backgroundColor: DOTS[g] ?? colors.dim }]} />
          <Text style={styles.dotText}>{g.toUpperCase()}</Text>
        </View>
      ))}
    </View>
  );
}

/** One of the three things you can do with a film, as a rubber stamp. */
export function StampButton({
  title,
  onPress,
  tone = "cream",
  tilt = 0,
  flex = 1,
}: {
  title: string;
  onPress: () => void;
  tone?: "amber" | "cream" | "dim";
  tilt?: number;
  flex?: number;
}) {
  const color = tone === "amber" ? colors.amber : tone === "dim" ? colors.dim : colors.cream;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.stamp,
        { borderColor: color, flex, transform: [{ rotate: `${tilt}deg` }, { scale: pressed ? 0.94 : 1 }] },
      ]}
    >
      <View style={[styles.stampInner, { borderColor: color }]}>
        <Text style={[styles.stampText, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {title.toUpperCase()}
        </Text>
      </View>
    </Pressable>
  );
}

export function ShelfLip() {
  return (
    <View style={styles.shelf}>
      <View style={styles.shelfHi} />
    </View>
  );
}

// ── The membership card ─────────────────────────────────────────────────
// Laminated: a photo window, a number, a signature strip, a barcode. `accent`
// is the profile theme's colour, so a noir member carries a noir card.

/** Two groups of four digits hashed from the member's id — same as the web's
 *  lib/member-no.ts, so a card reads the same number in both. */
export function memberNo(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  return `${String(h % 10000).padStart(4, "0")} ${String(Math.floor(h / 10000) % 10000).padStart(4, "0")}`;
}

const BARS = [2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 3];

export function MemberCard({
  id,
  name,
  handle,
  accent,
  photo,
  action,
  footnote,
}: {
  id: string;
  name: string;
  handle?: string | null;
  accent: string;
  /** The avatar, already rendered. */
  photo: React.ReactNode;
  /** Top-right: the follow button, or the way to Settings. */
  action?: React.ReactNode;
  footnote: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardBrand}>
          DEEP CUT<Text style={{ color: colors.ticket }}>.</Text> VIDEO
        </Text>
        <Text style={[styles.cardKind, { color: accent }]}>MEMBERSHIP CARD</Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardPhoto}>{photo}</View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={[styles.cardName, { color: accent, textShadowColor: accent }]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {name.toUpperCase()}
          </Text>
          {handle ? <Text style={styles.cardHandle}>@{handle}</Text> : null}
          <Text style={styles.cardNo}>No. {memberNo(id)}</Text>
        </View>
        {action ? <View style={{ alignSelf: "flex-start" }}>{action}</View> : null}
      </View>
      <View style={styles.cardFoot}>
        <View style={styles.cardSig}>
          <Text style={styles.cardSigText} numberOfLines={1}>
            {name}
          </Text>
        </View>
        <View style={styles.cardBars}>
          {BARS.map((w, i) => (
            <View key={i} style={{ width: w, height: 26, backgroundColor: colors.cream, opacity: 0.85 }} />
          ))}
        </View>
      </View>
      <Text style={styles.cardTerms}>{footnote.toUpperCase()}</Text>
    </View>
  );
}

// ── The punch card ──────────────────────────────────────────────────────
// Ten holes to the next credit; one punched for every tenth of the way.

export function PunchCard({ progress, note }: { progress: number; note: string }) {
  const punched = Math.floor(Math.max(0, Math.min(1, progress)) * 10 + 0.001);
  return (
    <View>
      <View
        style={styles.punch}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 10, now: punched }}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <View key={i} style={[styles.punchHole, i < punched && styles.punchDone]} />
        ))}
      </View>
      <View style={styles.punchNote}>
        <Text style={styles.punchNoteText}>{punched} of 10 punched</Text>
        <Text style={styles.punchNoteText}>{note}</Text>
      </View>
    </View>
  );
}

// ── The lobby ───────────────────────────────────────────────────────────
// The view switch is the felt letterboard over the concession stand.

export function FeltBoard<K extends string>({
  items,
  value,
  onChange,
  badges,
}: {
  items: ReadonlyArray<{ key: K; label: string; sub: string }>;
  value: K;
  onChange: (key: K) => void;
  /** Unread counts, by key. */
  badges?: Partial<Record<K, number>>;
}) {
  return (
    <View style={styles.feltFrame}>
      <View style={styles.felt}>
        {items.map((t) => {
          const on = t.key === value;
          const badge = badges?.[t.key] ?? 0;
          return (
            <Pressable
              key={t.key}
              onPress={() => onChange(t.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.feltItem, on && styles.feltItemOn]}
            >
              <Text style={[styles.feltLabel, on && { color: colors.light }]}>{t.label.toUpperCase()}</Text>
              <Text style={[styles.feltSub, on && { color: colors.amber }]}>{t.sub.toUpperCase()}</Text>
              {badge > 0 && (
                <View style={styles.feltBadge}>
                  <Text style={styles.feltBadgeText}>{badge > 9 ? "9+" : badge}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The corkboard hot takes are pinned to. */
export function Cork({ children }: { children: React.ReactNode }) {
  return <View style={styles.cork}>{children}</View>;
}

/** A comment card, pinned. `index` alternates the tilt down the board. */
export function Pinned({ index = 0, children }: { index?: number; children: React.ReactNode }) {
  const tilt = index % 3 === 2 ? -0.3 : index % 2 ? 0.8 : -0.7;
  return (
    <View style={[styles.pinned, { transform: [{ rotate: `${tilt}deg` }] }]}>
      <View style={styles.pin} />
      {children}
    </View>
  );
}

// ── Paper ───────────────────────────────────────────────────────────────
// Anything you fill in is paper: a comment card, a tape label, a form.

export function PaperHead({ left, right }: { left: string; right: string }) {
  return (
    <View style={styles.paperHead}>
      <Text style={styles.paperHeadLeft}>{left.toUpperCase()}</Text>
      <Text style={styles.paperHeadRight}>{right.toUpperCase()}</Text>
    </View>
  );
}

const PARTS = ["Films", "Screens", "Signature", "Name"] as const;

/** The top of the membership application: four parts of one form, a box
 *  ticked for each one done. */
export function ApplicationStrip({ part, style }: { part: 1 | 2 | 3 | 4; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[styles.appForm, style]}
      accessibilityLabel={`Membership application, part ${part} of 4`}
    >
      <PaperHead left="Membership application" right="Deep Cut Video" />
      <View style={styles.appParts}>
        {PARTS.map((label, i) => {
          const done = i + 1 < part;
          const now = i + 1 === part;
          return (
            <View key={label} style={styles.appPart}>
              <View style={[styles.appBox, now && { borderColor: "#a8371d", borderWidth: 2 }]}>
                {done ? <Text style={styles.appTick}>✕</Text> : null}
              </View>
              <Text style={[styles.appPartText, now && { color: colors.paperInk, fontFamily: fonts.monoSemi }]}>
                {label.toUpperCase()}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── The booth ───────────────────────────────────────────────────────────
// A label punched out of embossing tape, and the steel plate it's stuck to.

export function Dymo({
  children,
  tone = "black",
  style,
}: {
  children: React.ReactNode;
  tone?: "black" | "red" | "amber";
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.dymo,
        tone === "red" && { backgroundColor: "#a82e18" },
        tone === "amber" && { backgroundColor: "#b5802a" },
        style,
      ]}
    >
      <Text style={[styles.dymoText, tone === "amber" && { color: "#1d1206" }]}>{children}</Text>
    </View>
  );
}

export function BoothPlate({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.plate, style]}>
      {(["tl", "tr", "bl", "br"] as const).map((c) => (
        <View
          key={c}
          pointerEvents="none"
          style={[
            styles.screw,
            c[0] === "t" ? { top: 6 } : { bottom: 6 },
            c[1] === "l" ? { left: 6 } : { right: 6 },
          ]}
        />
      ))}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // marquee
  mq: {
    borderRadius: 10,
    backgroundColor: "#130e0c",
    borderWidth: 1,
    borderColor: "rgba(243,233,215,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mqBulbs: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  mqBulb: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.amber,
    shadowColor: colors.amber,
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  mqPlate: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingVertical: 5, paddingHorizontal: 2 },
  mqLabel: { color: colors.ticket, fontFamily: fonts.monoSemi, fontSize: 9.5, letterSpacing: 3 },
  mqDate: { color: colors.dim, fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 3 },
  mqBoard: {
    borderRadius: 3,
    backgroundColor: "#f4e6c6",
    paddingHorizontal: 10,
    overflow: "hidden",
    shadowColor: "#ffd696",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  mqTrack: { position: "absolute", left: 0, right: 0, height: 2, backgroundColor: "rgba(40,26,16,0.22)" },
  mqWords: { flexDirection: "row", flexWrap: "wrap", columnGap: 9 },
  mqWord: { flexDirection: "row", height: ROW, alignItems: "center" },
  mqLetter: { color: "#1a1210", fontFamily: fonts.display, fontSize: 40, lineHeight: ROW, letterSpacing: 1 },
  // box office
  bo: {
    borderRadius: 12,
    backgroundColor: "#3a2217",
    borderWidth: 1,
    borderColor: "#1c100a",
    padding: 9,
  },
  boPlate: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 9,
    borderRadius: 3,
    backgroundColor: "#c79b56",
    paddingVertical: 3,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderTopWidth: 1,
    borderTopColor: "#f0dba8",
    borderBottomWidth: 1,
    borderBottomColor: "#7d5c2a",
  },
  boScrew: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: "#6b4a1c" },
  boPlateText: { color: "#3a2410", fontFamily: fonts.display, fontSize: 16, letterSpacing: 5 },
  boGlass: {
    borderRadius: 8,
    backgroundColor: "#15100d",
    borderWidth: 1,
    borderColor: "rgba(255,220,170,0.14)",
    padding: 12,
  },
  boSlot: {
    marginTop: 9,
    borderRadius: 6,
    backgroundColor: "#0e0a08",
    borderWidth: 1,
    borderColor: "rgba(255,220,170,0.1)",
    padding: 8,
    paddingBottom: 6,
  },
  boSlotLabel: {
    color: "rgba(243,233,215,0.45)",
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 4,
    textAlign: "center",
    marginTop: 6,
  },
  grille: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#b98d47",
    borderWidth: 2,
    borderColor: "#6b4a1c",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  grilleHole: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: "#0a0706" },
  // shelf
  vhsCase: {
    flexDirection: "row",
    borderRadius: 5,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    backgroundColor: "#14100e",
    padding: 4,
    paddingLeft: 0,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    shadowColor: "#000",
    shadowOpacity: 0.7,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  vhsSpine: { width: 8, marginRight: 1, backgroundColor: "#060504", borderRightWidth: 2, borderRightColor: "#2a221e" },
  sticker: {
    position: "absolute",
    left: -7,
    top: 10,
    backgroundColor: colors.amber,
    borderRadius: 2,
    paddingVertical: 2,
    paddingHorizontal: 5,
    transform: [{ rotate: "-9deg" }],
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  stickerText: { color: "#24160c", fontFamily: fonts.monoSemi, fontSize: 7.5, letterSpacing: 1.2 },
  dots: { flexDirection: "row", flexWrap: "wrap", columnGap: 10, rowGap: 4, marginTop: 6 },
  dotItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
  dotText: { color: "rgba(243,233,215,0.8)", fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1.3 },
  stamp: { borderWidth: 1.5, borderRadius: 3, padding: 2.5 },
  stampInner: { borderWidth: 1, borderRadius: 2, paddingVertical: 7, paddingHorizontal: 4, alignItems: "center" },
  stampText: { fontFamily: fonts.monoSemi, fontSize: 10, letterSpacing: 1.6 },
  shelf: { height: 13, backgroundColor: "#54361f", borderBottomLeftRadius: 3, borderBottomRightRadius: 3, borderBottomWidth: 4, borderBottomColor: "#2f1d11" },
  shelfHi: { height: 1, backgroundColor: "rgba(255,220,170,0.4)" },
  // membership card
  card: {
    borderRadius: 12,
    backgroundColor: "#211712",
    borderWidth: 1,
    borderColor: "rgba(255,241,214,0.16)",
    padding: 14,
    paddingBottom: 12,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingBottom: 9,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(243,233,215,0.14)",
  },
  cardBrand: { color: colors.cream, fontFamily: fonts.display, fontSize: 18, letterSpacing: 2.4 },
  cardKind: { fontFamily: fonts.mono, fontSize: 8.5, letterSpacing: 3 },
  cardBody: { flexDirection: "row", alignItems: "center", gap: 13, paddingTop: 12 },
  cardPhoto: {
    borderRadius: 6,
    padding: 3,
    backgroundColor: colors.cream,
    transform: [{ rotate: "-2deg" }],
  },
  cardName: {
    fontFamily: fonts.display,
    fontSize: 36,
    lineHeight: 36,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  cardHandle: { color: colors.dim, fontFamily: fonts.mono, fontSize: 12, marginTop: 2 },
  cardNo: { color: colors.cream, fontFamily: fonts.mono, fontSize: 11, letterSpacing: 3.4, marginTop: 5 },
  cardFoot: { flexDirection: "row", alignItems: "flex-end", gap: 12, marginTop: 12 },
  cardSig: { flex: 1, minWidth: 0, borderRadius: 2, backgroundColor: "#e9dbbb", paddingHorizontal: 8, paddingVertical: 1 },
  cardSigText: { color: "#1d2a5c", fontFamily: fonts.serif, fontSize: 21, lineHeight: 26 },
  cardBars: { flexDirection: "row", gap: 2, alignItems: "flex-end" },
  cardTerms: { color: "rgba(243,233,215,0.45)", fontFamily: fonts.mono, fontSize: 7.5, letterSpacing: 1.6, marginTop: 9 },
  // punch card
  punch: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderRadius: 6,
    backgroundColor: colors.paper,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  punchHole: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderStyle: "dashed", borderColor: "rgba(42,28,21,0.45)" },
  punchDone: { borderWidth: 0, backgroundColor: "#17110f" },
  punchNote: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 6 },
  punchNoteText: { color: colors.dim, fontFamily: fonts.mono, fontSize: 9.5 },
  // felt board
  feltFrame: { borderRadius: 8, backgroundColor: "#3a2418", padding: 3 },
  felt: { flexDirection: "row", gap: 2, borderRadius: 6, backgroundColor: "#0b0908", padding: 5, borderWidth: 1, borderColor: "rgba(243,233,215,0.1)" },
  feltItem: { flex: 1, alignItems: "center", borderRadius: 3, paddingVertical: 9 },
  feltItemOn: { backgroundColor: "rgba(255,180,84,0.12)" },
  feltLabel: { color: "rgba(243,233,215,0.55)", fontFamily: fonts.display, fontSize: 16, letterSpacing: 1.6 },
  feltSub: { color: "rgba(243,233,215,0.4)", fontFamily: fonts.mono, fontSize: 7, letterSpacing: 1.2, marginTop: 3 },
  feltBadge: {
    position: "absolute",
    top: 2,
    right: 4,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: colors.ticket,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  feltBadgeText: { color: colors.cream, fontFamily: fonts.monoSemi, fontSize: 9 },
  // cork
  cork: {
    borderRadius: 8,
    backgroundColor: "#7c5630",
    borderWidth: 4,
    borderColor: "#3a2418",
    paddingVertical: 16,
    paddingHorizontal: 12,
    gap: 18,
  },
  pinned: {
    borderRadius: 2,
    backgroundColor: colors.paper,
    padding: 13,
    paddingTop: 16,
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  pin: {
    position: "absolute",
    top: -6,
    alignSelf: "center",
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: colors.ticket,
    borderWidth: 1,
    borderColor: "#7a1f10",
  },
  // paper
  paperHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: colors.paperInk,
  },
  paperHeadLeft: { color: colors.paperInk, fontFamily: fonts.monoSemi, fontSize: 8.5, letterSpacing: 2.4 },
  paperHeadRight: { color: colors.paperDim, fontFamily: fonts.mono, fontSize: 8.5, letterSpacing: 2.4 },
  appForm: {
    borderRadius: 3,
    backgroundColor: colors.paper,
    padding: 11,
    paddingBottom: 10,
    transform: [{ rotate: "-0.4deg" }],
  },
  appParts: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  appPart: { flexDirection: "row", alignItems: "center", gap: 5 },
  appBox: { width: 12, height: 12, borderWidth: 1.5, borderColor: colors.paperInk, alignItems: "center", justifyContent: "center" },
  appTick: { color: "#1d2a5c", fontSize: 9, lineHeight: 10, fontWeight: "700" },
  appPartText: { color: colors.paperDim, fontFamily: fonts.mono, fontSize: 8, letterSpacing: 1 },
  // booth
  dymo: {
    alignSelf: "flex-start",
    borderRadius: 1.5,
    backgroundColor: "#19191c",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.16)",
  },
  dymoText: { color: "#f4f1ea", fontFamily: fonts.monoSemi, fontSize: 10, letterSpacing: 3, textTransform: "uppercase" },
  plate: {
    borderRadius: 6,
    backgroundColor: "#221b18",
    borderWidth: 1,
    borderColor: "rgba(243,233,215,0.09)",
    padding: 16,
  },
  screw: { position: "absolute", width: 6, height: 6, borderRadius: 3, backgroundColor: "#8a7a6c", borderWidth: 1.5, borderColor: "#17110f" },
});
