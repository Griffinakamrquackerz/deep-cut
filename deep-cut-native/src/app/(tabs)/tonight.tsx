import Slider from "@react-native-community/slider";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { useAuth } from "../_layout";
import { api } from "@/lib/api";
import { colors, fonts, mono } from "@/lib/theme";
import { supabase } from "@/lib/supabase";
import { VIBES, type Rec, type Reaction } from "@/lib/types";
import { byRecommendationPreference } from "@/lib/recommendation-quality";
import AdSlot from "@/components/AdSlot";
import HouseCall from "@/components/HouseCall";
import Confetti from "@/components/Confetti";
import RecCard from "@/components/RecCard";
import NowShowing from "@/components/NowShowing";
import ReactionSheet, { type ReactionPayload } from "@/components/ReactionSheet";
import { Button, Eyebrow, Marquee, MarqueeBulbs, Poster } from "@/components/ui";
import { useUsherTarget } from "@/lib/usher";

// The Tonight screen — a faithful port of the web app's front room:
// bulbs → marquee → Now Showing → the doors → "TONIGHT I WANT…" card
// (vibes, obscurity slider, my-services) → the dealt marquee below.

/** Once ever, not once per launch. */
const AUTO_DEAL_KEY = "dc-auto-dealt";

export default function Tonight() {
  const router = useRouter();
  const { session } = useAuth();
  // Usher spotlight targets — the flashlight lands on these real controls.
  const dealRef = useUsherTarget("deal");
  const dialRef = useUsherTarget("dial");
  const doorsRef = useUsherTarget("doors");
  const settleRef = useUsherTarget("settle");
  const rollRef = useUsherTarget("roll");
  const blendRef = useUsherTarget("blend");
  const [recs, setRecs] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [dealing, setDealing] = useState(false);
  const [depth, setDepth] = useState(3); // less-seen films; the quality gate still applies
  const [mineOnly, setMineOnly] = useState(false);
  const [vibe, setVibe] = useState<string | null>(null);
  const [tuning, setTuning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Development-only diagnostics; never include film titles or account data.
  const [dealDiagnostic, setDealDiagnostic] = useState<string | null>(null);
  const pendingDealTiming = useRef<{
    started: number;
    reloadEnded: number;
    addedIds: Set<string>;
    summary: string;
  } | null>(null);
  useEffect(() => {
    const pending = pendingDealTiming.current;
    if (!__DEV__ || !pending || !recs.some((rec) => pending.addedIds.has(rec.id))) return;
    pendingDealTiming.current = null;
    const now = performance.now();
    setDealDiagnostic(`${pending.summary}\nGET → state committed ${Math.round(now - pending.reloadEnded)}ms · tap → state committed ${Math.round(now - pending.started)}ms`);
  }, [recs]);
  const [reacting, setReacting] = useState<Rec | null>(null);
  const [confetti, setConfetti] = useState(0);

  const load = useCallback(async () => {
    const res = await api<{ recs: Rec[]; error?: string }>("/api/recs");
    if (res.ok) {
      setRecs((res.data?.recs ?? []).filter((r) => r.status === "active"));
    } else {
      setMessage(`Couldn't load your recs${res.data?.error ? `: ${String(res.data.error).slice(0, 120)}` : ""}.`);
    }
    setLoading(false);
    return {
      status: res.status,
      ok: res.ok,
      active: (res.data?.recs ?? []).filter((r) => r.status === "active"),
    };
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Cold start: deal one batch, once ever.
  //
  // The web app has had this since launch (TonightScreen.tsx); native didn't,
  // so somebody who installed from the App Store finished four onboarding
  // steps and landed on "THE HOUSE IS DARK / Deal a batch above." A first
  // screen that reads as broken, on the one surface Apple sends people to.
  //
  // Guarded exactly like the web version: fires only on a genuinely clean
  // empty state, and AsyncStorage makes it once-ever rather than once-per-
  // launch, so it never quietly spends a returning member's daily deals.
  const autoDealt = useRef(false);
  useEffect(() => {
    if (autoDealt.current || loading || dealing || recs.length > 0 || message) return;
    autoDealt.current = true;
    void (async () => {
      const seen = await AsyncStorage.getItem(AUTO_DEAL_KEY).catch(() => "1");
      if (seen) return; // already done, or storage is unreadable — don't guess
      await AsyncStorage.setItem(AUTO_DEAL_KEY, "1").catch(() => {});
      await deal();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, dealing, recs.length, message]);

  async function deal() {
    const started = performance.now();
    const previousIds = new Set(recs.map((rec) => rec.id));
    pendingDealTiming.current = null;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDealing(true);
    setMessage(null);
    if (__DEV__) setDealDiagnostic("Deal diagnostic: submitting…");
    let outcome = "POST did not complete";
    try {
      const postStarted = performance.now();
      const res = await api<{ dealt?: number; error?: string }>("/api/recs", {
        method: "POST",
        body: JSON.stringify({ obscurityMin: depth, obscurityMax: 5, myServicesOnly: mineOnly, vibe }),
      });
      outcome = `POST ${res.status} · ${Math.round(performance.now() - postStarted)}ms · dealt=${res.data?.dealt ?? "missing"}`;
      if (__DEV__) setDealDiagnostic(outcome);
      if (res.status === 429) {
        // No external-purchase steering in the native app.
        setMessage("That's today's deals. The vault reopens tomorrow.");
      } else if (!res.ok) {
        setMessage("The projector jammed. Try again in a minute.");
      } else if ((res.data?.dealt ?? 0) === 0) {
        setMessage("No qualifying deep cuts on this pass. Try again or switch off your platform filter.");
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      const reloadStarted = performance.now();
      const reload = await load();
      const reloadEnded = performance.now();
      if (__DEV__) {
        const added = reload.ok ? reload.active.filter((rec) => !previousIds.has(rec.id)) : [];
        const summary = `${outcome}\nGET ${reload.status} · ${Math.round(reloadEnded - reloadStarted)}ms · active=${reload.active.length} · new=${added.length}`;
        setDealDiagnostic(summary);
        // This measures the React state commit, not viewport visibility or posters.
        if (added.length > 0) {
          pendingDealTiming.current = {
            started, reloadEnded, addedIds: new Set(added.map((rec) => rec.id)), summary,
          };
        }
      }
    } catch {
      pendingDealTiming.current = null;
      setMessage("Couldn't finish refreshing your deal. Try again in a minute.");
      if (__DEV__) setDealDiagnostic(`${outcome}\nRequest or reload threw an error.`);
    } finally {
      setDealing(false);
    }
  }

  async function setStatus(rec: Rec, status: "watchlisted" | "dismissed" | "seen") {
    setRecs((prev) => prev.filter((r) => r.id !== rec.id)); // optimistic
    await api(`/api/recs/${rec.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
  }

  async function submitReaction(rec: Rec, payload: ReactionPayload) {
    setReacting(null);
    if (payload.reaction === "loved" || payload.reaction === "loved_ironically") {
      setConfetti((c) => c + 1);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setRecs((prev) => prev.filter((r) => r.id !== rec.id));
    await api("/api/logs", {
      method: "POST",
      body: JSON.stringify({ movieId: rec.movies?.id, recId: rec.id, ...payload }),
    });
  }

  // One line standing in for the whole console. Platforms only appear when the
  // filter is actually on — "all platforms" every time is noise.
  const tuneSummary = useMemo(() => {
    const v = VIBES.find((x) => x.key === vibe);
    return [
      v ? `${v.emoji} ${v.label}` : "🎭 Any vibe",
      "◆".repeat(depth) + "◇".repeat(5 - depth),
      mineOnly ? "my platforms" : null,
    ]
      .filter(Boolean)
      .join("  ·  ");
  }, [vibe, depth, mineOnly]);

  const rankedRecs = useMemo(
    () => byRecommendationPreference(recs, depth),
    [recs, depth],
  );

  const header = useMemo(
    () => (
      <View style={{ gap: 16, paddingBottom: 16 }}>
        {/* Marquee header — same words as the web front room */}
        <View>
          <MarqueeBulbs />
          <Eyebrow style={{ marginTop: 10 }}>Tonight</Eyebrow>
          <Marquee size={46}>MOVIES YOU HAVEN&apos;T SEEN YET</Marquee>
        </View>

        {/* The open call. Above Now Showing because it is the one thing the
            house is asking for, and it draws nothing at all when there's no
            campaign running. */}
        <HouseCall />

        {/* Now Showing — the basement television, cropped out of its own
            photograph, in the slot the morning-after card used to hold. It
            flips channels on its own; tapping it opens the room. */}
        <NowShowing />

        {/* The games, demoted to a row of chips.
            They used to be three full-width doors of equal weight, all camp,
            all shouting — which is what made the front room feel busy, not the
            fact that the features exist. Now Showing is the hero, the dealer
            and the dial are the loop, and these three are a utility rail: same
            features, a third of the noise, and the page finally has a top.
            The kicker lines are gone with the doors. "Can't agree?" was doing
            the explaining, and that job belongs to the studio tour and to the
            screens themselves, not to the front room every single visit. */}
        <View ref={doorsRef} collapsable={false} style={styles.chipRow}>
          <Pressable ref={settleRef} collapsable={false} style={styles.chip} onPress={() => router.push("/settle")}>
            <Text style={styles.chipText}>⚖️  SETTLE IT</Text>
          </Pressable>
          <Pressable ref={rollRef} collapsable={false} style={styles.chip} onPress={() => router.push("/roll")}>
            <Text style={styles.chipText}>📺  JUST ROLL IT</Text>
          </Pressable>
          {/* The staff pick. Video stores hand-wrote these on index cards and
              taped them to the shelf, which is exactly the register this app is
              in — and a recommendation with a name attached carries weight that
              "FEATURED" never does. */}
          <Pressable ref={blendRef} collapsable={false} style={[styles.chip, styles.chipPick]} onPress={() => router.push("/blend")}>
            <Text style={styles.chipBadge}>★ GRIFF&apos;S FAVORITE</Text>
            <Text style={[styles.chipText, { color: colors.amber }]}>🧬  THIS MEETS THAT</Text>
          </Pressable>
        </View>

        {/* Tonight I want… — collapsed to one line by default.
            Expanded, this console pushed every dealt film below the fold: you
            scrolled past the marquee, Now Showing, the games rail AND
            five rows of controls before meeting a single movie. The controls
            outranked the product. The dial is one tap away and the deal button
            never moves. */}
        <View style={styles.wantCard}>
          <Pressable
            ref={dialRef}
            collapsable={false}
            onPress={() => setTuning((t) => !t)}
            style={styles.tuner}
            accessibilityRole="button"
            accessibilityLabel={`Tonight I want: ${tuneSummary}. Tap to change.`}
          >
            <Text style={styles.tunerText} numberOfLines={1}>
              {tuneSummary}
            </Text>
            <Text style={styles.tunerChevron}>{tuning ? "▴" : "▾"}</Text>
          </Pressable>

          {tuning && (
          <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 10 }}
          >
            {VIBES.map((v) => {
              const on = vibe === v.key;
              return (
                <Pressable
                  key={v.key}
                  onPress={() => setVibe(on ? null : v.key)}
                  style={[styles.vibeChip, on && { borderColor: colors.amber, backgroundColor: "rgba(255,180,84,0.12)" }]}
                >
                  <Text style={{ color: on ? colors.amber : colors.dim, fontFamily: mono, fontSize: 12 }}>
                    {v.emoji} {v.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Obscurity slider + diamond readout, like the web dial */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={styles.controlLabel}>Obscurity goal</Text>
            <Slider
              style={{ flex: 1, height: 36 }}
              minimumValue={3}
              maximumValue={5}
              step={1}
              value={depth}
              onValueChange={(v) => setDepth(Math.round(v))}
              minimumTrackTintColor={colors.amber}
              maximumTrackTintColor="rgba(243,233,215,0.35)"
              thumbTintColor={colors.cream}
            />
            <Text style={styles.dialReadout}>
              {depth === 3 ? "Niche" : depth === 4 ? "Obscure" : "Deep cut"}{" "}
              {"◆".repeat(depth)}
              {"◇".repeat(5 - depth)}
            </Text>
          </View>

          <Pressable onPress={() => setMineOnly((m) => !m)} style={styles.checkRow}>
            <View style={[styles.checkbox, mineOnly && styles.checkboxOn]}>
              {mineOnly && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkLabel}>my services only</Text>
          </Pressable>
          </>
          )}

          <View ref={dealRef} collapsable={false}>
            <Button
              title={dealing ? "Dealing…" : "★  Deal me more  ★"}
              onPress={deal}
              busy={dealing}
              pulse
            />
          </View>
          {message && <Text style={styles.message}>{message}</Text>}
          {dealDiagnostic && <Text selectable style={styles.message}>{dealDiagnostic}</Text>}
        </View>
      </View>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [depth, vibe, mineOnly, dealing, message, dealDiagnostic, tuning, tuneSummary, recs],
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <FlatList
        data={rankedRecs}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.amber} />
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>THE HOUSE IS DARK</Text>
              <Text style={styles.emptyLine}>Deal a batch above.</Text>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <Animated.View
            entering={FadeInDown.duration(350)
              .delay(Math.min(index, 8) * 70)
              .reduceMotion(ReduceMotion.System)}
          >
            {/* Fourth card down, matching web. Nothing for a member. */}
            {index === 3 && <AdSlot index={0} style={{ marginBottom: 14 }} />}
            <RecCard
              rec={item}
              onWatchlist={() => void setStatus(item, "watchlisted")}
              onDismiss={() => void setStatus(item, "dismissed")}
              onSeen={() => setReacting(item)}
            />
          </Animated.View>
        )}
      />
      <Confetti fire={confetti} />
      <ReactionSheet
        visible={!!reacting}
        title={reacting?.movies?.title ?? "it"}
        onClose={() => setReacting(null)}
        onSubmit={(p) => reacting && void submitReaction(reacting, p)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  // The games' rail. 46pt tall so the whole row costs about what one door did,
  // and a hair over Apple's 44pt touch minimum.
  chipRow: { flexDirection: "row", gap: 8 },
  chip: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  // The row stretches to its tallest chip, so the badge costs the rail about
  // ten points and the three stay level.
  chipPick: { borderColor: colors.amber },
  chipBadge: {
    color: colors.amber,
    fontFamily: fonts.monoSemi,
    fontSize: 7,
    letterSpacing: 1,
    marginBottom: 3,
  },
  chipText: {
    color: colors.cream,
    fontFamily: mono,
    fontSize: 9.5,
    letterSpacing: 0.5,
    textAlign: "center",
    lineHeight: 14,
  },
  wantCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 8,
  },
  controlLabel: {
    color: colors.dim,
    fontFamily: mono,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  dialReadout: { color: colors.amber, fontSize: 12, letterSpacing: 1.5 },
  tuner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 4,
  },
  tunerText: { color: colors.cream, fontFamily: mono, fontSize: 12.5, letterSpacing: 0.5, flex: 1 },
  tunerChevron: { color: colors.amber, fontSize: 12 },
  vibeChip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
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
  message: { color: colors.ticket, fontFamily: mono, fontSize: 12, lineHeight: 18, marginTop: 4 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyTitle: { color: colors.amber, fontFamily: fonts.display, fontSize: 28, letterSpacing: 2 },
  emptyLine: { color: colors.dim, fontFamily: mono, fontSize: 12, textAlign: "center" },
});
