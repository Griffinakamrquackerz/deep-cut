import Slider from "@react-native-community/slider";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { api } from "@/lib/api";
import { colors, fonts, glowAmber, mono } from "@/lib/theme";
import { Eyebrow, MarqueeBulbs } from "@/components/ui";

// The greenlight ballot, native.
//
// Same three rules as the web component, for the same reasons: the control
// clamps to votes you actually hold, the save is debounced so dragging writes
// once, and a failed save says so instead of quietly losing somebody's ballot.
//
// What is deliberately NOT here is any way to pay. Votes are earned by
// supporting the fund, and that happens on the website — a payment inside the
// iOS app puts the whole thing under Apple's in-app purchase rules. Members who
// hold no votes get told where to go and a link out to the browser.

const SAVE_DEBOUNCE_MS = 900;

interface Pitch {
  id: string;
  title: string;
  director: string;
  logline: string;
  synopsis: string;
  genre: string | null;
  comps: string | null;
  oneSheetUrl: string | null;
  deckUrl: string | null;
  priorWorkUrl: string | null;
}

interface RoundPayload {
  round: {
    id: string;
    title: string;
    status: "collecting" | "voting" | "greenlit" | "closed";
    closesAt: string | null;
    winnerPitchId: string | null;
  } | null;
  fund: { percent: number } | null;
  pitches?: Pitch[];
  tallies?: Array<{ pitchId: string; votes: number; backers: number }>;
  me?: { budget: number; spent: number; remaining: number; ballot: Record<string, number> } | null;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export default function VoteScreen() {
  const router = useRouter();
  const [data, setData] = useState<RoundPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const [save, setSave] = useState<SaveState>("idle");
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    void api<RoundPayload>("/api/round").then((res) => {
      if (!alive) return;
      setData(res.data);
      setAlloc(res.data?.me?.ballot ?? {});
      setLoading(false);
    });
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const push = useCallback(async (next: Record<string, number>) => {
    setSave("saving");
    setSaveNote(null);
    const res = await api<{ error?: string }>("/api/vote", {
      method: "POST",
      body: JSON.stringify({ allocation: next }),
    });
    if (res.ok) {
      setSave("saved");
      return;
    }
    setSave("error");
    setSaveNote(
      res.data?.error === "over_budget"
        ? "That's more votes than you hold. Nothing was saved."
        : res.data?.error === "not_voting"
          ? "Voting has closed on this round. Nothing was saved."
          : res.status === 401
            ? "You've been signed out. Sign in and your ballot is still here."
            : res.status === 0
              ? "Lost the connection. Your last saved ballot is unchanged."
              : "Couldn't save that. Your last saved ballot is unchanged.",
    );
  }, []);

  const budget = data?.me?.budget ?? 0;
  const spent = Object.values(alloc).reduce((s, n) => s + n, 0);
  const left = budget - spent;
  const canVote = !!data?.me && data.round?.status === "voting" && budget > 0;

  function set(id: string, next: number) {
    if (!canVote) return;
    const others = spent - (alloc[id] ?? 0);
    const clamped = Math.max(0, Math.min(Math.floor(next), budget - others));
    if (clamped === (alloc[id] ?? 0)) return;

    const updated = { ...alloc, [id]: clamped };
    if (clamped === 0) delete updated[id];
    setAlloc(updated);

    if (timer.current) clearTimeout(timer.current);
    setSave("idle");
    timer.current = setTimeout(() => void push(updated), SAVE_DEBOUNCE_MS);
  }

  const pitches = data?.pitches ?? [];
  const tallyBy = new Map((data?.tallies ?? []).map((t) => [t.pitchId, t]));
  const totalVotes = (data?.tallies ?? []).reduce((s, t) => s + t.votes, 0);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <MarqueeBulbs />
          <Eyebrow style={{ marginTop: 10 }}>Greenlight</Eyebrow>
          <Text style={styles.h1}>THE BALLOT</Text>
          <Text style={styles.lede}>
            Every pitch here has been read and every director&apos;s previous work
            watched. What&apos;s left is the part we don&apos;t decide:{" "}
            <Text style={{ color: colors.amber }}>which one gets made first</Text>.
          </Text>
        </View>

        {loading ? (
          <Text style={styles.loading}>Reading the ballot…</Text>
        ) : !data?.round ? (
          <View style={styles.card}>
            <Eyebrow style={{ color: colors.ticket }}>No round open</Eyebrow>
            <Text style={styles.cardTitle}>NOTHING ON THE BALLOT YET</Text>
            {/* Matches the web ballot's empty state. The round is not gated on
                the goal — nothing in /api/admin/round requires a funded pot —
                and saying it was put the retention mechanic behind the money it
                exists to raise. */}
            <Text style={styles.body}>
              We&apos;re reading pitches now. A slate goes up as soon as there
              are enough films worth choosing between — the fund doesn&apos;t
              have to be full first, and it&apos;s{" "}
              <Text style={{ color: colors.amber }}>
                {Math.round(data?.fund?.percent ?? 0)}% of the way there
              </Text>
              . Votes you earn now carry into the round.
            </Text>
          </View>
        ) : (
          <>
            {/* ── Standing ─────────────────────────────────────────── */}
            <View style={styles.standing}>
              <View style={styles.rowBetween}>
                <Eyebrow style={{ color: colors.ticket }}>{data.round.title}</Eyebrow>
                <Text style={styles.meta}>
                  {data.round.status === "voting"
                    ? "Voting open"
                    : data.round.status === "collecting"
                      ? "Reading pitches"
                      : data.round.status === "greenlit"
                        ? "Greenlit"
                        : "Closed"}
                </Text>
              </View>

              {canVote ? (
                <>
                  <Text style={styles.budget}>
                    <Text style={{ color: colors.amber }}>{left}</Text>
                    <Text style={{ color: colors.dim }}> of {budget} votes left</Text>
                  </Text>
                  <Text style={styles.meta}>
                    Spend them however you like — all on one, or split across the
                    slate. Move them around while the round is open.
                  </Text>
                </>
              ) : data.me && budget === 0 ? (
                // States a fact about the product and stops. There used to be a
                // link to the fund page here, and it was the single thing
                // keeping the app out of every storefront but the US: a button
                // pointing at an external purchase is Guideline 3.1.1, and the
                // 2025 carve-out that permits it only covers the United States.
                //
                // Removing it puts the app on the multiplatform-services path
                // (3.1.3(b)) instead — members who bought elsewhere use what
                // they bought, and the app never advertises where to buy. Same
                // route Netflix and Spotify take, no entitlement, every
                // storefront. The web keeps the full experience.
                <Text style={styles.body}>
                  You don&apos;t hold any votes yet — they&apos;re earned by
                  supporting the fund. You can read every pitch here either way.
                </Text>
              ) : (
                <Text style={styles.body}>
                  {data.round.status === "collecting"
                    ? "Pitches are still coming in. Voting opens once the slate is set."
                    : "Voting on this round has closed."}
                </Text>
              )}

              {save !== "idle" && (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[styles.saveNote, save === "error" && { color: colors.ticket }]}
                >
                  {save === "saving"
                    ? "Saving your ballot…"
                    : save === "saved"
                      ? "✓ Ballot saved."
                      : saveNote}
                </Text>
              )}
              {save === "error" && (
                <Pressable onPress={() => void push(alloc)}>
                  <Text style={styles.link}>Try again</Text>
                </Pressable>
              )}
            </View>

            {/* ── The slate ────────────────────────────────────────── */}
            {pitches.length === 0 ? (
              <Text style={styles.loading}>
                The slate isn&apos;t up yet. Every pitch gets read first, which takes
                a while.
              </Text>
            ) : (
              pitches.map((p) => {
                const mine = alloc[p.id] ?? 0;
                const t = tallyBy.get(p.id);
                const share = totalVotes > 0 ? ((t?.votes ?? 0) / totalVotes) * 100 : 0;
                const won = data.round?.winnerPitchId === p.id;
                const expanded = open === p.id;

                return (
                  <View
                    key={p.id}
                    style={[
                      styles.pitch,
                      won ? styles.pitchWon : mine > 0 ? styles.pitchMine : null,
                    ]}
                  >
                    {won && (
                      <Eyebrow style={{ color: colors.amber, marginBottom: 6 }}>
                        ★ Greenlit — this is the one
                      </Eyebrow>
                    )}

                    <View style={{ flexDirection: "row", gap: 12 }}>
                      {p.oneSheetUrl && (
                        <Image
                          source={{ uri: p.oneSheetUrl }}
                          style={styles.sheet}
                          contentFit="cover"
                          transition={160}
                        />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pitchTitle}>{p.title}</Text>
                        <Text style={styles.director}>
                          dir. {p.director}
                          {p.genre ? <Text style={{ color: colors.dim }}> · {p.genre}</Text> : null}
                        </Text>
                        <Text style={styles.logline}>{p.logline}</Text>
                      </View>
                    </View>

                    <View style={styles.linkRow}>
                      <Pressable onPress={() => setOpen(expanded ? null : p.id)}>
                        <Text style={styles.link}>{expanded ? "Less" : "Read the pitch"}</Text>
                      </Pressable>
                      {p.deckUrl && (
                        <Pressable onPress={() => void Linking.openURL(p.deckUrl!)}>
                          <Text style={styles.linkDim}>The deck ↗</Text>
                        </Pressable>
                      )}
                      {p.priorWorkUrl && (
                        <Pressable onPress={() => void Linking.openURL(p.priorWorkUrl!)}>
                          <Text style={styles.linkDim}>Their last film ↗</Text>
                        </Pressable>
                      )}
                    </View>

                    {expanded && (
                      <View style={styles.expanded}>
                        <Text style={styles.synopsis}>{p.synopsis}</Text>
                        {p.comps && (
                          <Text style={styles.comps}>
                            In the neighbourhood of:{" "}
                            <Text style={{ color: colors.cream }}>{p.comps}</Text>
                          </Text>
                        )}
                      </View>
                    )}

                    {canVote && (
                      <View style={styles.control}>
                        <Slider
                          style={{ flex: 1, height: 36 }}
                          minimumValue={0}
                          maximumValue={budget}
                          step={1}
                          value={mine}
                          onValueChange={(v) => set(p.id, Math.round(v))}
                          onSlidingComplete={() => {
                            void Haptics.selectionAsync();
                          }}
                          minimumTrackTintColor={colors.amber}
                          maximumTrackTintColor="rgba(243,233,215,0.25)"
                          thumbTintColor={colors.cream}
                        />
                        <Text style={styles.count}>
                          <Text style={{ color: colors.amber }}>{mine}</Text>
                          <Text style={{ color: colors.dim }}>
                            {" "}
                            vote{mine === 1 ? "" : "s"}
                          </Text>
                        </Text>
                      </View>
                    )}

                    <View style={styles.track}>
                      <View style={[styles.trackFill, { width: `${share}%` }]} />
                    </View>
                    <Text style={styles.tally}>
                      {t
                        ? `${t.votes.toLocaleString("en-US")} vote${t.votes === 1 ? "" : "s"} · ${t.backers} backer${t.backers === 1 ? "" : "s"}`
                        : "No votes yet"}
                    </Text>
                  </View>
                );
              })
            )}

            <Text style={styles.footnote}>
              Every ballot is ordered differently for every viewer, because whatever
              is printed first wins votes it didn&apos;t earn.
            </Text>
          </>
        )}

        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.linkDim}>← Back</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, paddingBottom: 64, gap: 12 },
  header: { alignItems: "center", marginBottom: 4 },
  h1: {
    fontFamily: fonts.display,
    fontSize: 46,
    lineHeight: 46,
    color: colors.amber,
    marginTop: 2,
    ...glowAmber,
  },
  lede: {
    color: "rgba(243,233,215,0.9)",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 10,
  },
  loading: {
    fontFamily: mono,
    fontSize: 12,
    color: colors.dim,
    textAlign: "center",
    paddingVertical: 32,
    lineHeight: 19,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 20,
    alignItems: "center",
  },
  cardTitle: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: colors.cream,
    marginTop: 6,
    textAlign: "center",
  },
  body: { color: colors.cream, fontSize: 14, lineHeight: 21, marginTop: 8 },
  standing: {
    borderWidth: 1,
    borderColor: "rgba(255,180,84,0.3)",
    backgroundColor: "rgba(255,180,84,0.05)",
    borderRadius: 10,
    padding: 14,
    gap: 6,
  },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  meta: { fontFamily: mono, fontSize: 11, color: colors.dim, lineHeight: 17 },
  budget: { fontFamily: fonts.display, fontSize: 30, color: colors.cream, marginTop: 2 },
  saveNote: {
    fontFamily: mono,
    fontSize: 11,
    color: colors.dim,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
    marginTop: 4,
  },
  link: { fontFamily: mono, fontSize: 11, color: colors.amber, textDecorationLine: "underline" },
  linkDim: { fontFamily: mono, fontSize: 11, color: colors.dim, textDecorationLine: "underline" },
  pitch: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
  },
  pitchMine: { borderColor: "rgba(255,180,84,0.5)", backgroundColor: "rgba(255,180,84,0.05)" },
  pitchWon: { borderColor: colors.amber, backgroundColor: "rgba(255,180,84,0.1)" },
  sheet: {
    width: 64,
    aspectRatio: 2 / 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pitchTitle: { fontFamily: fonts.display, fontSize: 24, lineHeight: 26, color: colors.cream },
  director: { fontFamily: mono, fontSize: 11, color: colors.amber, marginTop: 2 },
  logline: { color: "rgba(243,233,215,0.9)", fontSize: 13.5, lineHeight: 20, marginTop: 6 },
  linkRow: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 10 },
  expanded: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, marginTop: 10 },
  synopsis: { color: colors.dim, fontSize: 13.5, lineHeight: 20 },
  comps: { fontFamily: mono, fontSize: 11, color: colors.dim, marginTop: 8, lineHeight: 17 },
  control: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
    marginTop: 10,
  },
  count: { fontFamily: mono, fontSize: 12, width: 74, textAlign: "right" },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    overflow: "hidden",
    marginTop: 10,
  },
  trackFill: { height: "100%", backgroundColor: colors.amber },
  tally: { fontFamily: mono, fontSize: 11, color: colors.dim, marginTop: 4 },
  footnote: {
    fontFamily: mono,
    fontSize: 10.5,
    color: colors.dim,
    textAlign: "center",
    lineHeight: 16,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 12,
    marginTop: 4,
  },
  back: { alignItems: "center", paddingVertical: 12 },
});
