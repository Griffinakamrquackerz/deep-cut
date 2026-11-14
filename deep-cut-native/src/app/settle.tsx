import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import YoutubePlayer from "react-native-youtube-iframe";
import Animated, { FadeInDown, Keyframe, ZoomIn, ReduceMotion } from "react-native-reanimated";
import { useAuth } from "./_layout";
import { api } from "@/lib/api";
import { colors, fonts, glowAmber, mono } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import {
  SETTLE_POOL,
  SETTLE_QUESTIONS,
  candidatesToFilms,
  poolQueryFor,
  rankVerdicts,
  type Mood,
  type SettleAnswers,
  type Verdict,
} from "@/lib/settle";
import { Button, Chip, Eyebrow, FilmStrip, Marquee, MarqueeBulbs, Poster } from "@/components/ui";

// Settle It — the couch standoff, native. Two people, one phone, five
// questions each; the house rules. Engine is the verbatim web lib; this file
// is only the ceremony around it.

type Stage = "intro" | "quiz1" | "pass" | "quiz2" | "computing" | "verdict";

type Sheet = Partial<{
  mood: Mood;
  brain: 0 | 1 | 2;
  wantsShort: boolean;
  wantsNew: boolean;
  obscurity: 0 | 2 | 4;
}>;

// The gavel comes down — the verdict stamp SLAMS onto the card, oversized and
// crooked, then settles (web: @keyframes stamp-slam). Rests at -3deg to match
// the stamp's static tilt.
const STAMP_SLAM = new Keyframe({
  0: { opacity: 0, transform: [{ rotate: "-16deg" }, { scale: 2.4 }] },
  55: { opacity: 1, transform: [{ rotate: "-6deg" }, { scale: 0.9 }] },
  70: { opacity: 1, transform: [{ rotate: "-1deg" }, { scale: 1.06 }] },
  100: { opacity: 1, transform: [{ rotate: "-3deg" }, { scale: 1 }] },
}).duration(550);

const DELIBERATIONS = [
  "consulting the ledger…",
  "flipping a two-headed coin…",
  "polling the back row…",
  "checking who paid for snacks…",
  "overruling your worst instincts…",
  "cross-referencing the deep cuts…",
];

function toAnswers(name: string, sheet: Sheet): SettleAnswers {
  return {
    name,
    mood: sheet.mood ?? "feel",
    brain: (sheet.brain ?? 1) as 0 | 1 | 2,
    wantsShort: sheet.wantsShort ?? false,
    wantsNew: sheet.wantsNew ?? false,
    obscurity: (sheet.obscurity ?? 2) as 0 | 2 | 4,
  };
}

export default function Settle() {
  const router = useRouter();
  const { session } = useAuth();
  const [stage, setStage] = useState<Stage>("intro");
  const [p1Name, setP1Name] = useState("");
  const [p2Name, setP2Name] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [hasServices, setHasServices] = useState(false);
  const [p1, setP1] = useState<SettleAnswers | null>(null);
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [vi, setVi] = useState(0);
  const [quip, setQuip] = useState(DELIBERATIONS[0]);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [trailerError, setTrailerError] = useState(false);
  const [sealed, setSealed] = useState(false);
  const { width: screenW } = useWindowDimensions();

  const name1 = p1Name.trim() || "Player 1";
  const name2 = p2Name.trim() || "Player 2";

  useEffect(() => {
    if (!session) return;
    supabase
      .from("user_services")
      .select("service")
      .eq("user_id", session.user.id)
      .then(({ data }) => setHasServices((data ?? []).length > 0));
  }, [session]);

  // Cycle jury quips while deliberating.
  useEffect(() => {
    if (stage !== "computing") return;
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % DELIBERATIONS.length;
      setQuip(DELIBERATIONS[i]);
    }, 500);
    return () => clearInterval(t);
  }, [stage]);

  // Trailer for the verdict on the table (real-data films only).
  const current = verdicts[vi];
  useEffect(() => {
    setTrailerKey(null);
    setTrailerError(false);
    const id = current?.film.tmdbId;
    if (!id) return;
    let alive = true;
    api<{ trailerKey: string | null }>(`/api/settle/film?id=${id}`).then((r) => {
      if (alive) setTrailerKey(r.data?.trailerKey ?? null);
    });
    return () => {
      alive = false;
    };
  }, [current?.film.tmdbId]);

  async function buildVerdicts(a1: SettleAnswers, a2: SettleAnswers): Promise<Verdict[]> {
    const q = poolQueryFor(a1, a2);
    const res = await api<{ candidates?: Parameters<typeof candidatesToFilms>[0] }>(
      "/api/settle/pool",
      {
        method: "POST",
        body: JSON.stringify({
          genreIds: q.genreIds,
          obscurityMin: q.obscurityMin,
          obscurityMax: q.obscurityMax,
          eitherShort: q.eitherShort,
          myServicesOnly: mineOnly,
        }),
      },
    );
    if (res.ok) {
      const real = candidatesToFilms(res.data?.candidates ?? [], q.eitherShort);
      if (mineOnly) {
        if (real.length >= 3) return rankVerdicts(a1, a2, real);
      } else if (real.length >= 6) {
        return rankVerdicts(a1, a2, [...real, ...SETTLE_POOL]);
      }
    }
    return rankVerdicts(a1, a2); // offline / thin pool → the curated docket rules
  }

  async function finishP2(sheet: Sheet) {
    if (!p1) return;
    const a2 = toAnswers(name2, sheet);
    setStage("computing");
    const started = Date.now();
    const ranked = await buildVerdicts(p1, a2);
    // Let the jury deliberate at least a beat — the ceremony matters.
    const wait = Math.max(0, 1400 - (Date.now() - started));
    setTimeout(() => {
      setVerdicts(ranked);
      setVi(0);
      setSealed(false);
      setStage("verdict");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }, wait);
  }

  async function seal() {
    setSealed(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (current?.film.tmdbId && session) {
      await api("/api/signals", {
        method: "POST",
        body: JSON.stringify({ movieId: current.film.tmdbId, source: "settle_verdict" }),
      }).catch(() => null);
    }
  }

  function reset() {
    setStage("intro");
    setP1(null);
    setVerdicts([]);
    setVi(0);
    setSealed(false);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, flexGrow: 1 }}>
        {/* header + close */}
        <View style={{ marginBottom: 14 }}>
          <MarqueeBulbs />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
            <View>
              <Eyebrow style={{ marginTop: 10 }}>The couch standoff</Eyebrow>
              <Marquee size={40}>SETTLE IT</Marquee>
            </View>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
        </View>

        {stage === "intro" && (
          <View style={{ gap: 12 }}>
            <Text style={styles.lead}>
              Two of you, one phone. Five questions each — then the house rules, and nobody
              compromises out loud.
            </Text>
            <TextInput
              value={p1Name}
              onChangeText={setP1Name}
              placeholder="Player 1's name"
              placeholderTextColor={colors.dim}
              style={styles.input}
            />
            <TextInput
              value={p2Name}
              onChangeText={setP2Name}
              placeholder="Player 2's name"
              placeholderTextColor={colors.dim}
              style={styles.input}
            />
            {hasServices && (
              <Pressable onPress={() => setMineOnly((v) => !v)} style={styles.checkRow}>
                <View style={[styles.checkbox, mineOnly && styles.checkboxOn]}>
                  {mineOnly && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.checkLabel}>only films we can stream</Text>
              </Pressable>
            )}
            <Button title="★ Start the standoff ★" onPress={() => setStage("quiz1")} pulse />
            <FilmStrip holes={18} />
          </View>
        )}

        {stage === "quiz1" && (
          <Quiz
            player={name1}
            onDone={(sheet) => {
              setP1(toAnswers(name1, sheet));
              setStage("pass");
            }}
          />
        )}

        {stage === "pass" && (
          <View style={{ gap: 14, alignItems: "center", paddingVertical: 40 }}>
            <Text style={styles.passGlyph}>🤝</Text>
            <Text style={styles.passTitle}>PASS THE PHONE</Text>
            <Text style={styles.lead}>
              {name1} is locked in. Hand it to {name2} — no peeking at each other&apos;s answers.
            </Text>
            <View style={{ alignSelf: "stretch" }}>
              <Button title={`I'm ${name2} →`} onPress={() => setStage("quiz2")} />
            </View>
          </View>
        )}

        {stage === "quiz2" && <Quiz player={name2} onDone={(sheet) => void finishP2(sheet)} />}

        {stage === "computing" && (
          <View style={{ gap: 14, alignItems: "center", paddingVertical: 60 }}>
            <Text style={styles.passGlyph}>⚖️</Text>
            <Text style={styles.passTitle}>THE HOUSE DELIBERATES</Text>
            <Text style={[styles.lead, { textAlign: "center" }]}>{quip}</Text>
          </View>
        )}

        {stage === "verdict" && current && (
          <Animated.View
            key={`${current.film.title}-${vi}`}
            entering={ZoomIn.duration(300).reduceMotion(ReduceMotion.System)}
            style={{ gap: 12 }}
          >
            <View style={styles.verdictCard}>
              <Animated.Text
                entering={STAMP_SLAM.reduceMotion(ReduceMotion.System)}
                style={styles.stamp}
              >
                THE VERDICT
              </Animated.Text>
              <View style={{ flexDirection: "row", gap: 14 }}>
                <Poster
                  path={current.film.posterPath ?? null}
                  title={current.film.title}
                  year={current.film.year}
                  width={110}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.vTitle}>
                    {current.film.title} <Text style={styles.vYear}>{current.film.year}</Text>
                  </Text>
                  <Text style={styles.vMeta}>
                    {current.film.genres.join(" · ")} · ~{current.film.min} min
                  </Text>
                  <Text style={styles.vVibe}>“{current.film.vibe}”</Text>
                </View>
              </View>
              <View style={styles.whyBox}>
                <Text style={styles.whyKicker}>WHY THIS SETTLES IT</Text>
                <Text style={styles.whyLine}>{current.why}</Text>
              </View>
              {trailerKey && !trailerError && (
                <View style={styles.trailerBox}>
                  {/* Auto-rolls muted the moment the verdict lands; tap for sound. */}
                  <YoutubePlayer
                    key={trailerKey}
                    height={Math.round(((screenW - 40) * 9) / 16)}
                    width={screenW - 40}
                    play
                    mute={muted}
                    videoId={trailerKey}
                    onError={() => setTrailerError(true)}
                    initialPlayerParams={{ modestbranding: true, rel: false }}
                    webViewProps={{
                      allowsInlineMediaPlayback: true,
                      mediaPlaybackRequiresUserAction: false,
                    }}
                  />
                  {muted && (
                    <Pressable style={styles.soundPill} onPress={() => setMuted(false)}>
                      <Text style={styles.soundPillText}>🔊 Tap for sound</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>

            {sealed ? (
              <Animated.View entering={FadeInDown.reduceMotion(ReduceMotion.System)}>
                <Text style={styles.sealedLine}>
                  🎬 Sealed. Lights down — enjoy {current.film.title}.
                </Text>
              </Animated.View>
            ) : (
              <View style={{ gap: 8 }}>
                <Button title="🎬 That's the one" onPress={() => void seal()} pulse />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Re-roll →"
                      kind="outline"
                      size="sm"
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setVi((i) => (i + 1) % Math.max(verdicts.length, 1));
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button title="Start over" kind="ghost" size="sm" onPress={reset} />
                  </View>
                </View>
              </View>
            )}
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// One player's five questions — chips, auto-advance, camp progress bulbs.
function Quiz({ player, onDone }: { player: string; onDone: (sheet: Sheet) => void }) {
  const [qi, setQi] = useState(0);
  const [sheet, setSheet] = useState<Sheet>({});
  const q = SETTLE_QUESTIONS[qi];

  function answer(value: unknown) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = { ...sheet, [q.key]: value } as Sheet;
    if (qi + 1 < SETTLE_QUESTIONS.length) {
      setSheet(next);
      setQi(qi + 1);
    } else {
      onDone(next);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <Eyebrow>
        {player} · question {qi + 1} of {SETTLE_QUESTIONS.length}
      </Eyebrow>
      <Text style={styles.question}>{q.prompt}</Text>
      <View style={{ gap: 8 }}>
        {q.options.map((o) => (
          <Chip key={String(o.value)} label={o.label} onPress={() => answer(o.value)} />
        ))}
      </View>
      <Text style={styles.progress}>
        {"●".repeat(qi)}
        {"○".repeat(SETTLE_QUESTIONS.length - qi)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  close: { color: colors.dim, fontSize: 22, padding: 4 },
  lead: { color: colors.cream, fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    backgroundColor: colors.surface,
    color: colors.cream,
    padding: 14,
    textAlign: "center",
  },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: colors.amber, borderColor: colors.amber },
  checkmark: { color: colors.bg, fontSize: 13, lineHeight: 15 },
  checkLabel: { color: colors.cream, fontFamily: mono, fontSize: 13 },
  question: { color: colors.amber, fontFamily: fonts.display, fontSize: 30, letterSpacing: 1, ...glowAmber },
  progress: { color: colors.dim, fontFamily: mono, fontSize: 12, letterSpacing: 4, textAlign: "center", marginTop: 8 },
  passGlyph: { fontSize: 44 },
  passTitle: { color: colors.amber, fontFamily: fonts.display, fontSize: 30, letterSpacing: 2, ...glowAmber },
  verdictCard: {
    backgroundColor: colors.surface,
    borderColor: "rgba(255,180,84,0.5)",
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 12,
  },
  stamp: {
    alignSelf: "flex-start",
    color: colors.ticket,
    fontFamily: fonts.display,
    fontSize: 22,
    letterSpacing: 3,
    borderWidth: 2,
    borderColor: colors.ticket,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    transform: [{ rotate: "-3deg" }],
  },
  vTitle: { color: colors.cream, fontFamily: fonts.display, fontSize: 26, letterSpacing: 0.5 },
  vYear: { color: colors.dim, fontFamily: fonts.mono, fontSize: 13 },
  vMeta: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11, marginTop: 4 },
  vVibe: { color: colors.cream, fontFamily: fonts.bodyItalic, fontSize: 14, lineHeight: 20, marginTop: 8 },
  whyBox: {
    borderTopWidth: 1,
    borderColor: colors.line,
    paddingTop: 10,
  },
  whyKicker: { color: colors.ticket, fontFamily: fonts.mono, fontSize: 9, letterSpacing: 2.5 },
  whyLine: { color: colors.cream, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 4 },
  sealedLine: { color: colors.avail, fontFamily: mono, fontSize: 13, textAlign: "center", paddingVertical: 8 },
  trailerBox: {
    marginTop: 10,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#000",
  },
  soundPill: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(13,9,7,0.85)",
    borderWidth: 1,
    borderColor: colors.amber,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  soundPillText: { color: colors.amber, fontFamily: fonts.monoSemi, fontSize: 10, letterSpacing: 1 },
});
