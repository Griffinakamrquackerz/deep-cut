import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { api } from "@/lib/api";
import { colors, fonts, mono, posterUrl } from "@/lib/theme";
import type { SearchHit } from "@/lib/types";
import RatingLine from "@/components/RatingLine";
import { Button, Eyebrow, Marquee, MarqueeBulbs, Poster } from "@/components/ui";

// This Meets That — name two or three films, get the one that feels like their
// offspring. The splice itself runs server-side (/api/blend): an LLM that
// understands why films combine, backed by a TMDB keyword pull.

const MAX_PARENTS = 3;

// Worked examples for the empty state — every one a real result the engine
// returned for those parents, not an invented pairing. They teach the game
// faster than any instruction, and tapping one loads its parents so you can
// run it yourself. One is picked at random each time the screen opens.
interface Example {
  parents: SearchHit[];
  child: { id: number; title: string; year: number; poster_path: string };
  line: string;
}

const EXAMPLES: Example[] = [
  {
    parents: [
      { id: 8587, title: "The Lion King", year: 1994, poster_path: "/sKCr78MXSLixwmZ8DyJLrpMsd15.jpg" },
      { id: 597, title: "Titanic", year: 1997, poster_path: "/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg" },
      { id: 447332, title: "A Quiet Place", year: 2018, poster_path: "/nAU74GmpUk7t5iklEp3bufwDq4n.jpg" },
    ],
    child: { id: 80278, title: "The Impossible", year: 2012, poster_path: "/k0DLCiDbnYywOHiISALbl2EH2NE.jpg" },
    line: "Titanic's catastrophic disaster, Lion King's loss and growth of a young survivor, A Quiet Place's tense family survival silence.",
  },
  {
    parents: [
      { id: 578, title: "Jaws", year: 1975, poster_path: "/lxM6kqilAdpdhqUl2biYp5frUxE.jpg" },
      { id: 137, title: "Groundhog Day", year: 1993, poster_path: "/gCgt1WARPZaXnq523ySQEUKinCs.jpg" },
    ],
    child: { id: 26466, title: "Triangle", year: 2009, poster_path: "/cRlMrbc4Iof7vN0ZqHwJnMBYBLi.jpg" },
    line: "Shipwreck nightmare by way of Groundhog Day's endless loop, mixing Jaws' ocean terror with time\u2011loop dread.",
  },
  {
    parents: [
      { id: 680, title: "Pulp Fiction", year: 1994, poster_path: "/vQWk5YBFWF4bZaofAbv0tShwBvQ.jpg" },
      { id: 194, title: "Am\u00e9lie", year: 2001, poster_path: "/nSxDa3M9aMvGVLoItzWTepQ5h5d.jpg" },
    ],
    child: { id: 8321, title: "In Bruges", year: 2008, poster_path: "/vz3Vd6nfq9YZrVvyYx5RHFaYKV3.jpg" },
    line: "Pulp Fiction's crime\u2011laden, darkly comic dialogue meets Am\u00e9lie's whimsical kindness and Paris\u2011like small\u2011town charm, wrapped in a moral redemption tale.",
  },
  {
    parents: [
      { id: 694, title: "The Shining", year: 1980, poster_path: "/uAR0AWqhQL1hQa69UDEbb2rE5Wx.jpg" },
      { id: 8363, title: "Superbad", year: 2007, poster_path: "/ek8e8txUyUwd2BNqj6lFEerJfbq.jpg" },
    ],
    child: { id: 22970, title: "The Cabin in the Woods", year: 2012, poster_path: "/zZZe5wn0udlhMtdlDjN4NB72R6e.jpg" },
    line: "The Shining's isolated horror setting meets Superbad's teen party chaos, wrapped in dark meta\u2011comedy.",
  },
  {
    parents: [
      { id: 603, title: "The Matrix", year: 1999, poster_path: "/dXNAPwY7VrqMAo51EKhhCJfaGb5.jpg" },
      { id: 76, title: "Before Sunrise", year: 1995, poster_path: "/kf1Jb1c2JAOqjuzA3H4oDM263uB.jpg" },
    ],
    child: { id: 152601, title: "Her", year: 2013, poster_path: "/eCOtqtfvn7mxGl6nfmq4b1exJRc.jpg" },
    line: "The Matrix's AI philosophy meets Before Sunrise's intimate urban dialogue, forming a near\u2011future love story about consciousness and connection.",
  },
  {
    parents: [
      { id: 348, title: "Alien", year: 1979, poster_path: "/vfrQk5IPloGg1v9Rzbh2Eg3VGyM.jpg" },
      { id: 2108, title: "The Breakfast Club", year: 1985, poster_path: "/gp4zlj7wgbiofLMNsTPndMuO3PN.jpg" },
    ],
    child: { id: 9276, title: "The Faculty", year: 1998, poster_path: "/5XetJwmAiDC0EtH23NIXaqFn3Wl.jpg" },
    line: "Alien parasite takeover of high school mirrors Alien, while cliques echo Breakfast Club's archetypes.",
  },
  {
    parents: [
      { id: 244786, title: "Whiplash", year: 2014, poster_path: "/7fn624j5lj3xTme2SgiLCeuedmO.jpg" },
      { id: 1091, title: "The Thing", year: 1982, poster_path: "/tzGY49kseSE9QAKk47uuDGwnSCu.jpg" },
    ],
    child: { id: 44214, title: "Black Swan", year: 2010, poster_path: "/viWheBd44bouiLCHgNMvahLThqx.jpg" },
    line: "Whiplash\u2019s brutal quest for flawless performance collides with The Thing\u2019s claustrophobic paranoia and body\u2011transforming dread, set in an isolated ballet company.",
  },
  {
    parents: [
      { id: 289, title: "Casablanca", year: 1943, poster_path: "/lGCEKlJo2CnWydQj7aamY7s1S7Q.jpg" },
      { id: 78, title: "Blade Runner", year: 1982, poster_path: "/63N9uy8nd9j7Eog2axPQ8lbr3Wj.jpg" },
    ],
    child: { id: 8072, title: "Alphaville", year: 1965, poster_path: "/fFJP3D5fJDFxN7ChqSye1DZ0fTL.jpg" },
    line: "Alphaville's dystopic police state and noir romance echo Casablanca's resistance intrigue and Blade Runner's tech\u2011noir atmosphere.",
  },
  {
    parents: [
      { id: 161, title: "Ocean's Eleven", year: 2001, poster_path: "/hQQCdZrsHtZyR6NbKH2YyCqd2fR.jpg" },
      { id: 376867, title: "Moonlight", year: 2016, poster_path: "/qLnfEmPrDjJfPyyddLJPkXmshkp.jpg" },
    ],
    child: { id: 290098, title: "The Handmaiden", year: 2016, poster_path: "/dLlH4aNHdnmf62umnInL8xPlPzw.jpg" },
    line: "Ocean's Eleven's elaborate con by way of Moonlight's lesbian intimacy, set in a tense, period caper.",
  },
  {
    parents: [
      { id: 419430, title: "Get Out", year: 2017, poster_path: "/tFXcEccSQMf3lfhfXKSU9iRBpa3.jpg" },
      { id: 137, title: "Groundhog Day", year: 1993, poster_path: "/gCgt1WARPZaXnq523ySQEUKinCs.jpg" },
    ],
    child: { id: 440021, title: "Happy Death Day", year: 2017, poster_path: "/cTaEIUYTt52ooq9quVbAQ7NpGwo.jpg" },
    line: "Get Out's horror satire meets Groundhog Day's endless repeat, delivering dark comedy and a killer stuck in a time loop.",
  },
  {
    parents: [
      { id: 115, title: "The Big Lebowski", year: 1998, poster_path: "/3bv6WAp6BSxxYvB5ozKFUYuRA8C.jpg" },
      { id: 807, title: "Se7en", year: 1995, poster_path: "/191nKfP0ehp3uIvWqgPbFmI4lv9.jpg" },
    ],
    child: { id: 86838, title: "Seven Psychopaths", year: 2012, poster_path: "/4ukEYAxlSivFcDG6vLxJB6PjTjg.jpg" },
    line: "Seven Psychopaths merges The Big Lebowski's slacker, nihilistic humor with Se7en's sin\u2011based serial killer plot, shot in darkly comic style.",
  },
  {
    parents: [
      { id: 157336, title: "Interstellar", year: 2014, poster_path: "/yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg" },
      { id: 492188, title: "Marriage Story", year: 2019, poster_path: "/2JRyCKaRKyJAVpsIHeLvPw5nHmw.jpg" },
    ],
    child: { id: 24420, title: "The Time Traveler's Wife", year: 2009, poster_path: "/J3ewuzQwhFro0pDpdcbZ4j7MYy.jpg" },
    line: "Time-travel romance confronting inevitable separation, marrying Interstellar's temporal physics with Marriage Story's relentless marital conflict.",
  },
  {
    parents: [
      { id: 496243, title: "Parasite", year: 2019, poster_path: "/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg" },
      { id: 771, title: "Home Alone", year: 1990, poster_path: "/onTSipZ8R3bliBdKfPtsDuHTdlL.jpg" },
    ],
    child: { id: 19971, title: "The Little Girl Who Lives Down the Lane", year: 1976, poster_path: "/qlH7atDoN2iOmq6pNsoFIlebhgA.jpg" },
    line: "Parasite's tense class\u2011conflict thriller meets Home Alone's solitary child defending home against predators.",
  },
  {
    parents: [
      { id: 329865, title: "Arrival", year: 2016, poster_path: "/pEzNVQfdzYDzVK0XqxERIw2x2se.jpg" },
      { id: 8363, title: "Superbad", year: 2007, poster_path: "/ek8e8txUyUwd2BNqj6lFEerJfbq.jpg" },
    ],
    child: { id: 59678, title: "Attack the Block", year: 2011, poster_path: "/wzCMnA6NDruLzgWeqMcLPDrGAdF.jpg" },
    line: "Attack the Block fuses Arrival's alien contact urgency with Superbad's teenage gang chaos and night\u2011time mischief.",
  },
  {
    parents: [
      { id: 949, title: "Heat", year: 1995, poster_path: "/umSVjVdbVwtx5ryCA2QXL44Durm.jpg" },
      { id: 142, title: "Brokeback Mountain", year: 2005, poster_path: "/aByfQOQBNa4CMFwIgq3QrqY2ZHh.jpg" },
    ],
    child: { id: 9303, title: "Bound", year: 1996, poster_path: "/9qAy6UWVw44dGrsyKrdEMt5qIUM.jpg" },
    line: "Heat's meticulous heist tension fused with Brokeback's forbidden lesbian love, both locked in deadly cat\u2011and\u2011mouse.",
  },
  {
    parents: [
      { id: 37165, title: "The Truman Show", year: 1998, poster_path: "/vuza0WqY239yBXOadKlGwJsZJFE.jpg" },
      { id: 348, title: "Alien", year: 1979, poster_path: "/vfrQk5IPloGg1v9Rzbh2Eg3VGyM.jpg" },
    ],
    child: { id: 2666, title: "Dark City", year: 1998, poster_path: "/tNPEGju4DpTdbhBphNmZoEi9Bd3.jpg" },
    line: "The Truman Show\u2019s fabricated world by alien-like Strangers, merged with Alien\u2019s parasitic horror and claustrophobic chase.",
  },
  {
    parents: [
      { id: 641, title: "Requiem for a Dream", year: 2000, poster_path: "/9BTwsLaMVHOGFlmsSlx5QYCaXb.jpg" },
      { id: 252, title: "Willy Wonka & the Chocolate Factory", year: 1971, poster_path: "/vmpsZkrs4Uvkp9r1atL8B3frA63.jpg" },
    ],
    child: { id: 1417, title: "Pan's Labyrinth", year: 2006, poster_path: "/z7xXihu5wHuSMWymq5VAulPVuvg.jpg" },
    line: "Requiem's hallucinatory descent meets Wonka's whimsical trials, a dark fairy\u2011tale testing a child\u2019s survival.",
  },
];

interface BlendPick {
  id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  overview: string;
  genres: string[];
  reason: string;
  tmdb_rating: number | null;
  imdb_rating: number | null;
  rt_rating: number | null;
  fromVault?: boolean;
}

// Narration for the splice wait. Ordered so the last line can sit indefinitely
// without lying — a slow model just stays "something's moving".
const EXAMPLE_ROTATE_MS = 3000;

const SPLICE_STAGES = ["Reading the DNA…", "Crossing the strands…", "Something's moving…"];

/** A waiting slot. The next one to fill breathes amber so it reads as live. */
function EmptySlot({ live, optional }: { live: boolean; optional: boolean }) {
  const reduced = useReducedMotion();
  const glow = useSharedValue(0);

  useEffect(() => {
    if (!live || reduced) {
      glow.value = 0;
      return;
    }
    glow.value = withRepeat(withTiming(1, { duration: 1100 }), -1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, reduced]);

  const style = useAnimatedStyle(() => ({
    borderColor: `rgba(255,180,84,${0.35 + glow.value * 0.55})`,
    opacity: 0.75 + glow.value * 0.25,
  }));

  return (
    <View style={{ width: 62 }}>
      <Animated.View style={[styles.emptySlot, live ? style : styles.emptySlotIdle]}>
        <Text style={[styles.emptySlotMark, live && { color: colors.amber }]}>＋</Text>
      </Animated.View>
      <Text style={styles.slotCaption}>{optional ? "optional" : " "}</Text>
    </View>
  );
}

export default function Blend() {
  const router = useRouter();
  const [parents, setParents] = useState<SearchHit[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [picks, setPicks] = useState<BlendPick[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Starts on a random example so reopening doesn't always begin on the same
  // one, then cycles. No SSR here, so the state initialiser is safe.
  const [exampleIdx, setExampleIdx] = useState(
    () => Math.floor(Math.random() * EXAMPLES.length),
  );
  const example = EXAMPLES[exampleIdx];
  const [stage, setStage] = useState<string>(SPLICE_STAGES[0]);

  // Rotate the worked example. Paused whenever the card isn't on screen —
  // there's nothing to animate mid-splice, and it would land on a new one the
  // moment you came back.
  const exampleVisible = parents.length === 0 && !picks && !busy;
  useEffect(() => {
    if (!exampleVisible) return;
    const t = setInterval(
      () => setExampleIdx((i) => (i + 1) % EXAMPLES.length),
      EXAMPLE_ROTATE_MS,
    );
    return () => clearInterval(t);
  }, [exampleVisible]);

  // Advance the narration while the splice runs.
  useEffect(() => {
    if (!busy) {
      setStage(SPLICE_STAGES[0]);
      return;
    }
    let i = 0;
    const t = setInterval(() => {
      i = Math.min(i + 1, SPLICE_STAGES.length - 1);
      setStage(SPLICE_STAGES[i]);
    }, 2600);
    return () => clearInterval(t);
  }, [busy]);

  function search(q: string) {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      const res = await api<{ results: SearchHit[] }>(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok && res.data) setResults((res.data.results ?? []).slice(0, 6));
    }, 300);
  }

  function addParent(hit: SearchHit) {
    if (parents.length >= MAX_PARENTS || parents.some((p) => p.id === hit.id)) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setParents((p) => [...p, hit]);
    setQuery("");
    setResults([]);
    setPicks(null); // the lineup changed — last splice is stale
  }

  function removeParent(id: number) {
    setParents((p) => p.filter((x) => x.id !== id));
    setPicks(null);
  }

  async function splice() {
    if (parents.length < 2) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(true);
    setError(null);
    setPicks(null);
    const res = await api<{ picks?: BlendPick[] }>("/api/blend", {
      method: "POST",
      body: JSON.stringify({ movieIds: parents.map((p) => p.id) }),
    });
    if (!res.ok) {
      setError("The splice didn't take. Try again.");
    } else if (!res.data?.picks?.length) {
      setError("No offspring survived. Swap one out.");
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPicks(res.data.picks);
    }
    setBusy(false);
  }

  function reset() {
    setParents([]);
    setPicks(null);
    setError(null);
    setQuery("");
    setResults([]);
  }

  const canSplice = parents.length >= 2;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <MarqueeBulbs />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}>
            <Eyebrow style={{ marginTop: 10 }}>The splice</Eyebrow>
            <Marquee size={42}>THIS MEETS THAT</Marquee>
          </View>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>
        <Text style={styles.lead}>Combine two or three. See what crawls out.</Text>

        {/* The bench. Always three slots, filled or waiting — the shape of the
            game is visible before you've done anything, and the next slot to
            fill breathes so it reads as the live one. */}
        <View style={styles.bench}>
          <View style={styles.slab}>
            {Array.from({ length: MAX_PARENTS }).map((_, i) => {
              const p = parents[i];
              const isNext = !p && i === parents.length;
              return (
                <React.Fragment key={p?.id ?? `slot-${i}`}>
                  {i > 0 && (
                    <Text style={[styles.meets, !p && !isNext && styles.meetsIdle]}>meets</Text>
                  )}
                  {p ? (
                    <Pressable
                      onPress={() => !busy && removeParent(p.id)}
                      style={styles.parent}
                      disabled={busy}
                    >
                      <Poster path={p.poster_path ?? null} title={p.title} year={p.year} width={62} />
                      <Text style={styles.parentTitle} numberOfLines={2}>
                        {p.title}
                      </Text>
                      {!busy && (
                        <View style={styles.removeBadge}>
                          <Text style={styles.removeText}>✕</Text>
                        </View>
                      )}
                    </Pressable>
                  ) : (
                    <EmptySlot live={isNext} optional={i === MAX_PARENTS - 1} />
                  )}
                </React.Fragment>
              );
            })}
          </View>
          {/* The wait is a model thinking for 10-20s. Narrate it rather than
              leaving a dead button — the lab doing work is half the fun. */}
          {busy && <Text style={styles.stage}>🧬 {stage}</Text>}
        </View>

        {/* Search — hidden once the bench is full */}
        {parents.length < MAX_PARENTS && (
          <>
            <TextInput
              value={query}
              onChangeText={search}
              placeholder="Search a film…"
              placeholderTextColor="rgba(183,164,145,0.6)"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            {results.length > 0 && (
              <View style={styles.resultsCard}>
                {results.map((r, i) => (
                  <Pressable
                    key={r.id}
                    onPress={() => addParent(r)}
                    style={[styles.resultRow, i > 0 && styles.resultDivider]}
                  >
                    {r.poster_path ? (
                      <Image
                        source={{ uri: posterUrl(r.poster_path, "w342") ?? undefined }}
                        style={styles.resultPoster}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={styles.resultPoster} />
                    )}
                    <Text style={styles.resultTitle} numberOfLines={1}>
                      {r.title}
                    </Text>
                    <Text style={styles.resultYear}>{r.year ?? ""}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}

        <View style={{ marginTop: 14, gap: 8 }}>
          <Button
            title={busy ? "Splicing…" : "🧬  Splice them  🧬"}
            onPress={() => void splice()}
            busy={busy}
            disabled={!canSplice}
            pulse={canSplice}
          />
          {!canSplice && (
            <Text style={styles.hint}>
              {parents.length === 0 ? "Pick two films to begin." : "One more."}
            </Text>
          )}
          {parents.length > 0 && !busy && (
            <Button title="Clear" kind="ghost" size="sm" onPress={reset} />
          )}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {/* Empty state only — once you're playing, it gets out of the way. */}
        {exampleVisible && example && (
          <Animated.View
            key={exampleIdx}
            entering={FadeIn.duration(420).reduceMotion(ReduceMotion.System)}
          >
          <Pressable
            style={styles.example}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setParents(example.parents);
              setPicks(null);
            }}
          >
            <View style={styles.exampleHeader}>
              <Eyebrow>For instance</Eyebrow>
              <View style={styles.dots}>
                {EXAMPLES.map((_, i) => (
                  <View key={i} style={[styles.dot, i === exampleIdx && styles.dotOn]} />
                ))}
              </View>
            </View>
            <View style={styles.exampleRow}>
              {example.parents.map((p, i) => (
                <React.Fragment key={p.id}>
                  {i > 0 && <Text style={styles.examplePlus}>+</Text>}
                  <Image
                    source={{ uri: posterUrl(p.poster_path ?? null, "w342") ?? undefined }}
                    style={styles.exampleThumb}
                    contentFit="cover"
                  />
                </React.Fragment>
              ))}
              <Text style={styles.exampleArrow}>→</Text>
              <Image
                source={{ uri: posterUrl(example.child.poster_path, "w342") ?? undefined }}
                style={styles.exampleChild}
                contentFit="cover"
              />
            </View>
            <Text style={styles.exampleCaption}>
              {example.parents.map((p) => p.title).join(" + ")} ={" "}
              <Text style={styles.exampleChildName}>
                {example.child.title} ({example.child.year})
              </Text>
            </Text>
            <Text style={styles.exampleLine}>“{example.line}”</Text>
            <Text style={styles.exampleCta}>TRY THIS ONE ▸</Text>
          </Pressable>
          </Animated.View>
        )}

        {/* The offspring */}
        {picks && (
          <View style={{ marginTop: 22 }}>
            <Eyebrow>The offspring</Eyebrow>
            <View style={{ gap: 12, marginTop: 10 }}>
              {picks.map((p, i) => (
                <Animated.View
                  key={p.id}
                  entering={FadeInDown.duration(320)
                    .delay(Math.min(i, 6) * 80)
                    .reduceMotion(ReduceMotion.System)}
                >
                  <Pressable style={styles.pick} onPress={() => router.push(`/m/${p.id}`)}>
                    <Poster path={p.poster_path} title={p.title} year={p.year} width={78} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.pickTitle} numberOfLines={2}>
                        {p.title} <Text style={styles.pickYear}>{p.year ?? ""}</Text>
                      </Text>
                      {i === 0 && <Text style={styles.crown}>★ CLOSEST MATCH</Text>}
                      <RatingLine
                        imdb={p.imdb_rating}
                        rt={p.rt_rating}
                        tmdb={p.tmdb_rating}
                        genres={p.genres}
                        style={{ marginTop: 3 }}
                      />
                      <Text style={styles.pickReason} numberOfLines={3}>
                        “{p.reason}”
                      </Text>
                    </View>
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  close: { color: colors.dim, fontSize: 22, padding: 4 },
  lead: { color: colors.cream, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, marginTop: 6 },
  // The row of slots. Spacing lives on `bench` now — the slab is inside it.
  slab: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 6,
  },
  meets: { color: colors.amber, fontFamily: fonts.display, fontSize: 13, letterSpacing: 1, marginTop: 34 },
  parent: { width: 62, alignItems: "center", position: "relative" },
  parentTitle: {
    color: colors.dim,
    fontFamily: mono,
    fontSize: 9.5,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 13,
  },
  removeBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: { color: colors.cream, fontSize: 11, lineHeight: 13 },
  emptySlot: {
    width: 62,
    height: 93,
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  emptySlotMark: { color: colors.dim, fontSize: 22 },
  emptySlotIdle: { borderColor: "rgba(90,78,70,0.5)", opacity: 0.6 },
  slotCaption: {
    color: "rgba(183,164,145,0.5)",
    fontFamily: mono,
    fontSize: 9,
    textAlign: "center",
    marginTop: 4,
  },
  bench: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: "rgba(35,27,24,0.4)",
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  meetsIdle: { color: "rgba(183,164,145,0.35)" },
  stage: {
    color: colors.amber,
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 1.5,
    textAlign: "center",
    marginTop: 12,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.cream,
    fontFamily: mono,
    fontSize: 14,
    marginTop: 14,
  },
  resultsCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 6,
    marginTop: 6,
    overflow: "hidden",
  },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 8 },
  resultDivider: { borderTopWidth: 1, borderTopColor: colors.line },
  resultPoster: { width: 30, height: 45, borderRadius: 3, backgroundColor: colors.bg },
  resultTitle: { color: colors.cream, fontFamily: fonts.body, fontSize: 14, flex: 1 },
  resultYear: { color: colors.dim, fontFamily: mono, fontSize: 11 },
  hint: { color: colors.dim, fontFamily: mono, fontSize: 11, textAlign: "center" },
  example: {
    marginTop: 22,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  exampleHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dots: { flexDirection: "row", gap: 4 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.line },
  dotOn: { backgroundColor: colors.amber },
  exampleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  exampleThumb: { width: 52, height: 78, borderRadius: 4, backgroundColor: colors.bg },
  exampleChild: {
    width: 68,
    height: 102,
    borderRadius: 3,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: "rgba(255,180,84,0.6)",
  },
  examplePlus: { color: colors.dim, fontFamily: fonts.display, fontSize: 15 },
  exampleArrow: { color: colors.amber, fontFamily: fonts.display, fontSize: 20, paddingHorizontal: 2 },
  exampleCaption: { color: colors.dim, fontFamily: mono, fontSize: 10, lineHeight: 15, marginTop: 8 },
  exampleChildName: { color: colors.cream },
  exampleLine: {
    color: colors.dim,
    fontFamily: fonts.bodyItalic,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 4,
  },
  exampleCta: { color: colors.amber, fontFamily: mono, fontSize: 10, letterSpacing: 1.5, marginTop: 8 },
  error: { color: colors.ticket, fontFamily: mono, fontSize: 12, marginTop: 12, textAlign: "center" },
  pick: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  pickTitle: { color: colors.cream, fontFamily: fonts.display, fontSize: 21, letterSpacing: 0.5 },
  pickYear: { color: colors.dim, fontFamily: fonts.mono, fontSize: 12 },
  crown: { color: colors.amber, fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1.5, marginTop: 3 },
  pickReason: {
    color: colors.cream,
    fontFamily: fonts.bodyItalic,
    fontSize: 13.5,
    lineHeight: 19,
    marginTop: 5,
  },
});
